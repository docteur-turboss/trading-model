import { randomUUID } from "node:crypto";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import {
	DELIVERY_LATENCY_SECONDS,
	IN_FLIGHT_MESSAGES,
} from "../../config/metrics";
import {
	DELIVERY_ATTEMPT_TIMEOUT_MS,
	retryDueMs,
} from "../../domain/backoff-calculator";
import type { MessageDeliveryPort } from "../../domain/ports/message-delivery.port";
import {
	JOURNAL_GROUP_GRACE_MS,
	type JournalEntry,
	type JournalGroup,
	type MessageJournalPort,
} from "../../domain/ports/message-journal.port";
import { Subscription } from "./subscription";
import type { SubscriptionRegistry } from "./subscription-registry";

/** Entries one group handles per read: a slow subscriber holds its own group only. */
const BATCH = 100;
/** A blocking read ends after this long without entry, so the loop sees a stop. */
const BLOCK_MS = 1000;

export interface DeliveryWorkerDeps {
	journal: MessageJournalPort;
	registry: SubscriptionRegistry;
	deliveryPort: MessageDeliveryPort;
	/** Between two looks for new groups and two takeovers of due retries. */
	pollMs?: number;
	/** Name of this replica in the consumer groups. */
	consumer?: string;
	/** Without live subscriber for this long, a group is retired (default JOURNAL_GROUP_GRACE_MS). */
	graceMs?: number;
}

/**
 * Delivers the journal (ADR-0048), outside any publisher's request. Every
 * replica runs one: a loop per group takes over the entries whose retry is
 * due (its own or a dead replica's) and reads the new ones (blocking, so a
 * message is delivered as it arrives), then delivers them to the subscriber
 * service. The retry state (attempts,
 * last attempt) lives in the journal, not here.
 */
export class DeliveryWorker {
	private readonly _consumer: string;
	private readonly _pollMs: number;
	/** Circuit breaker per group, local to the replica. */
	private readonly _subscriptions = new Map<string, Subscription>();
	private readonly _loops = new Map<string, Promise<void>>();
	/** When each group was first seen without live subscriber (local: a restart restarts the grace). */
	private readonly _unsubscribedSince = new Map<string, number>();
	private _timer: NodeJS.Timeout | undefined;
	private _stopped = true;

	constructor(private readonly _deps: DeliveryWorkerDeps) {
		this._consumer = _deps.consumer ?? `message-manager-${randomUUID()}`;
		this._pollMs = _deps.pollMs ?? 2000;
	}

	start(): void {
		this._stopped = false;
		const discover = () =>
			this._deps.journal
				.groups()
				.then((groups) => {
					for (const group of groups) {
						this._startLoop(group);
					}
				})
				.catch((err: unknown) =>
					getLogger().error("Listing the journal groups failed", {
						error: normalizeError(err),
					})
				);
		void discover();
		this._timer = setInterval(() => void discover(), this._pollMs);
	}

	/** Stops the loops, ends their blocking reads and waits for the attempts in flight (each bounded by its HTTP timeout). */
	async stop(): Promise<void> {
		this._stopped = true;
		clearInterval(this._timer);
		this._deps.journal.close?.();
		await Promise.all(this._loops.values());
		// A loop between its stop test and a read may have reopened a reader after the first close.
		this._deps.journal.close?.();
		this._loops.clear();
	}

	private _startLoop(group: JournalGroup): void {
		const key = `${group.topic}|${group.service}`;
		if (!this._loops.has(key)) {
			this._loops.set(key, this._loop(group));
		}
	}

	private async _loop(group: JournalGroup): Promise<void> {
		let lastClaim = 0;
		while (!this._stopped) {
			let served: boolean | "retired" = false;
			try {
				const claim = Date.now() - lastClaim >= this._pollMs;
				if (claim) {
					lastClaim = Date.now();
				}
				served = await this._deliverGroup(group, claim, BLOCK_MS);
				if (served === "retired") {
					return;
				}
			} catch (err) {
				if (this._stopped) {
					return;
				}
				getLogger().error("Delivery loop failed", {
					context: { topic: group.topic, targetService: group.service },
					error: normalizeError(err),
				});
			}
			if (!served) {
				// No subscriber or a failure: do not spin.
				await new Promise((resolve) => setTimeout(resolve, BLOCK_MS));
			}
		}
	}

	/** @returns false when the group has no live subscriber, "retired" once it was past the grace (the loop ends). */
	private async _deliverGroup(
		group: JournalGroup,
		claim: boolean,
		blockMs: number
	): Promise<boolean | "retired"> {
		const subscription = await this._subscription(group);
		const key = `${group.topic}|${group.service}`;
		if (!subscription) {
			// No live subscriber: what was accepted waits in the journal, until the grace is over.
			const since = this._unsubscribedSince.get(key) ?? Date.now();
			this._unsubscribedSince.set(key, since);
			if (Date.now() - since < (this._deps.graceMs ?? JOURNAL_GROUP_GRACE_MS)) {
				return false;
			}
			await this._deps.journal.retire(group);
			getLogger().warn(
				"Journal group retired: no subscriber for the grace period",
				{
					context: { topic: group.topic, targetService: group.service },
				}
			);
			this._unsubscribedSince.delete(key);
			this._subscriptions.delete(key);
			this._loops.delete(key);
			return "retired";
		}
		this._unsubscribedSince.delete(key);
		const { journal } = this._deps;
		const retry = {
			floorMs: DELIVERY_ATTEMPT_TIMEOUT_MS,
			dueAfterMs: retryDueMs,
		};
		const entries = [
			...(claim && !subscription.isCircuitOpen()
				? await journal.claimDue(group, this._consumer, retry, BATCH)
				: []),
			...(await journal.readNew(group, this._consumer, BATCH, blockMs)),
		];
		await Promise.all(
			entries.map((entry) => this._deliver(subscription, group, entry))
		);
		return true;
	}

	private async _subscription(
		group: JournalGroup
	): Promise<Subscription | undefined> {
		const bindings = await this._deps.registry.getSubscriptions(group.topic);
		const binding = bindings.find(
			(candidate) => candidate.serviceIdentity.serviceName === group.service
		);
		if (!binding) {
			return undefined;
		}
		const key = `${group.topic}|${group.service}`;
		const existing = this._subscriptions.get(key);
		if (existing?.callbackPath === binding.callbackPath) {
			return existing;
		}
		const subscription = new Subscription({
			...binding,
			deliveryPort: this._deps.deliveryPort,
		});
		this._subscriptions.set(key, subscription);
		return subscription;
	}

	private async _deliver(
		subscription: Subscription,
		group: JournalGroup,
		entry: JournalEntry
	): Promise<void> {
		IN_FLIGHT_MESSAGES.inc();
		try {
			const settled = await subscription.deliver(
				entry.message,
				entry.deliveries
			);
			if (settled) {
				await this._deps.journal.ack(group, entry.id);
				DELIVERY_LATENCY_SECONDS.observe(
					{ topic: group.topic },
					(Date.now() - (entry.message.metadata.emittedAt ?? Date.now())) / 1000
				);
			}
		} catch (err) {
			// Left pending: the next attempt is due after the backoff.
			getLogger().error("Message delivery failed", {
				context: {
					topic: group.topic,
					targetService: group.service,
					messageId: entry.message.metadata.messageId,
					error: normalizeError(err),
				},
			});
		} finally {
			IN_FLIGHT_MESSAGES.dec();
		}
	}
}
