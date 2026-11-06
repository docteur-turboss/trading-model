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
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import type {
	JournalEntry,
	JournalGroup,
	MessageJournalPort,
} from "../ports/message-journal-port";
import { Subscription } from "./subscription";
import type { SubscriptionRegistry } from "./subscription-registry";

/** Entries one group handles per tick: a slow subscriber holds its own group only. */
const BATCH = 10;

export interface DeliveryWorkerDeps {
	journal: MessageJournalPort;
	registry: SubscriptionRegistry;
	deliveryPort: MessageDeliveryPort;
	pollMs?: number;
	/** Name of this replica in the consumer groups. */
	consumer?: string;
}

/**
 * Delivers the journal (ADR-0043), outside any publisher's request. Every
 * replica runs one: each tick, for every group, it takes over the entries
 * whose retry is due (its own or a dead replica's) and reads the new ones,
 * then delivers them to the subscriber service. The retry state (attempts,
 * last attempt) lives in the journal, not here.
 */
export class DeliveryWorker {
	private readonly _consumer: string;
	private readonly _pollMs: number;
	/** Circuit breaker per group, local to the replica. */
	private readonly _subscriptions = new Map<string, Subscription>();
	private readonly _running = new Map<string, Promise<void>>();
	private _timer: NodeJS.Timeout | undefined;

	constructor(private readonly _deps: DeliveryWorkerDeps) {
		this._consumer = _deps.consumer ?? `message-manager-${randomUUID()}`;
		this._pollMs = _deps.pollMs ?? 500;
	}

	start(): void {
		this._timer = setInterval(() => {
			this.tick().catch((err: unknown) =>
				getLogger().error("Delivery tick failed", {
					error: normalizeError(err),
				})
			);
		}, this._pollMs);
	}

	/** Stops polling and waits for the attempts in flight (each bounded by its HTTP timeout). */
	async stop(): Promise<void> {
		clearInterval(this._timer);
		await Promise.all(this._running.values());
	}

	/** One pass over every group; a group still busy with its previous pass is skipped. */
	async tick(): Promise<void> {
		const groups = await this._deps.journal.groups();
		await Promise.all(groups.map((group) => this._run(group)));
	}

	private _run(group: JournalGroup): Promise<void> {
		const key = `${group.topic}|${group.service}`;
		const busy = this._running.get(key);
		if (busy !== undefined) {
			return busy;
		}
		const run = this._deliverGroup(group).finally(() =>
			this._running.delete(key)
		);
		this._running.set(key, run);
		return run;
	}

	private async _deliverGroup(group: JournalGroup): Promise<void> {
		const subscription = await this._subscription(group);
		if (!subscription) {
			// No live subscriber: what was accepted waits in the journal.
			return;
		}
		const { journal } = this._deps;
		const retry = {
			floorMs: DELIVERY_ATTEMPT_TIMEOUT_MS,
			dueAfterMs: retryDueMs,
		};
		const entries = [
			...(await journal.claimDue(group, this._consumer, retry, BATCH)),
			...(await journal.readNew(group, this._consumer, BATCH)),
		];
		await Promise.all(
			entries.map((entry) => this._deliver(subscription, group, entry))
		);
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
					service: group.service,
					messageId: entry.message.metadata.messageId,
					error: normalizeError(err),
				},
			});
		} finally {
			IN_FLIGHT_MESSAGES.dec();
		}
	}
}
