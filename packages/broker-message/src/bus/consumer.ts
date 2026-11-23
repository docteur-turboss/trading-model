import { randomUUID } from "node:crypto";
import { normalizeError } from "@trading-model/common/utils/errors";
import { withTimeout } from "@trading-model/common/utils/retry";
import { sleep } from "@trading-model/common/utils/sleep";
import { isExpectedPublisher } from "@trading-model/contracts/event-routes";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/primitives/primitives";
import { runInMessageTraceContext } from "../shared/trace-context";
import {
	ABORT_GRACE_MS,
	DELIVERY_ATTEMPT_TIMEOUT_MS,
	HANDLER_TIMEOUT_MS,
	retryDueMs,
} from "./backoff";
import type { DeadStreams } from "./dead-streams";
import {
	classifyDeliveryError,
	DlqReason,
	ErrorActionType,
	MAX_RETRIES,
} from "./delivery-error-classifier";
import { extractDeliveryParams } from "./delivery-metadata-extractor";
import type { JournalEntry, JournalGroup } from "./journal.port";
import {
	BUS_DEAD_LETTERS,
	JOURNAL_OLDEST_PENDING_AGE_SECONDS,
	JOURNAL_PENDING_ENTRIES,
	MESSAGES_DELIVERED_TOTAL,
	MESSAGES_DLQ_TOTAL,
	PUBLISHER_REJECTED_TOTAL,
} from "./metrics";
import type { RedisMessageJournal } from "./redis-journal";

const BATCH = 100;
/** A blocking read ends after this long without entry, so the loop sees a stop. */
const BLOCK_MS = 1000;
const CLAIM_EVERY_MS = 2000;
/** A consumer with nothing pending and silent this long is a dead replica: removed from the group. */
const CONSUMER_IDLE_MS = 10 * 60_000;
/** Between two reads of the backlog: a few Redis calls per topic, never per message. */
const LAG_EVERY_MS = 15_000;

export interface BusConsumerOptions {
	journal: RedisMessageJournal;
	deadStreams: DeadStreams;
	/** Consumer group: the subscriber service, shared with message-manager's workers. */
	service: string;
	/** Name of this replica in the group. */
	consumer?: string;
	/** Throws to retry; `signal` aborts at the handler deadline (stop the work, it is redelivered); a `DeadLetterError` dead-letters at once. */
	handle: (message: Message, signal: AbortSignal) => Promise<void>;
	/** Called once an entry is in the dead stream. */
	onDeadLetter?: (
		group: JournalGroup,
		message: Message,
		reason: string,
		deadId: string
	) => void;
}

/**
 * In-process consumer of the journal (ADR-0073): one loop per topic,
 * `XREADGROUP` for new entries, `XPENDING` + `XCLAIM` for retries that are
 * due (same backoff and limits as message-manager), `XACK` on success.
 * Replicas of a service share the group: one of them gets each entry.
 */
export class BusConsumer {
	private readonly _consumer: string;
	private readonly _loops: Promise<void>[] = [];
	private _stopped = true;
	private _lagTimer?: NodeJS.Timeout;

	constructor(private readonly _options: BusConsumerOptions) {
		this._consumer = _options.consumer ?? `${_options.service}-${randomUUID()}`;
	}

	/** Creates the groups (messages wait for a service that is down), then starts one loop per topic. */
	async start(topics: readonly string[]): Promise<void> {
		this._stopped = false;
		const groups = topics.map((topic) => ({
			topic: topic as Topic,
			service: this._options.service,
		}));
		await Promise.all(
			groups.map((group) => this._options.journal.register(group))
		);
		this._loops.push(...groups.map((group) => this._loop(group)));
		this._lagTimer = setInterval(
			() => void this._publishLag(topics),
			LAG_EVERY_MS
		);
		this._lagTimer.unref();
	}

	async stop(): Promise<void> {
		this._stopped = true;
		clearInterval(this._lagTimer);
		this._options.journal.close();
		await Promise.all(this._loops);
		// A loop between its stop test and a read may have reopened a reader.
		this._options.journal.close();
		this._loops.length = 0;
	}

	/** Sets the backlog and dead-letter gauges of this service's groups; a failed read drops the series (a stale value would fake or hide a backlog). */
	private async _publishLag(topics: readonly string[]): Promise<void> {
		const { journal, deadStreams, service } = this._options;
		JOURNAL_PENDING_ENTRIES.reset();
		JOURNAL_OLDEST_PENDING_AGE_SECONDS.reset();
		try {
			for (const lag of await journal.lag(service)) {
				const labels = { topic: lag.topic, service };
				JOURNAL_PENDING_ENTRIES.set(labels, lag.pending);
				JOURNAL_OLDEST_PENDING_AGE_SECONDS.set(
					labels,
					lag.oldestPendingAgeMs / 1000
				);
			}
			for (const topic of topics) {
				BUS_DEAD_LETTERS.set({ topic }, await deadStreams.length(topic));
			}
		} catch (err) {
			getLogger().error("Bus lag not published", {
				context: { service },
				error: normalizeError(err),
			});
		}
	}

	private async _loop(group: JournalGroup): Promise<void> {
		const { journal } = this._options;
		const retry = {
			floorMs: DELIVERY_ATTEMPT_TIMEOUT_MS,
			dueAfterMs: retryDueMs,
		};
		let lastClaim = 0;
		// A slow entry holds only its own slot: reads refill the free ones.
		const inFlight = new Set<Promise<void>>();
		// Entries whose handler still runs: a claim must not start them twice.
		const handling = new Set<string>();
		try {
			while (!this._stopped) {
				try {
					if (inFlight.size >= BATCH) {
						await Promise.race(inFlight);
						continue;
					}
					const claim = Date.now() - lastClaim >= CLAIM_EVERY_MS;
					if (claim) {
						lastClaim = Date.now();
					}
					if (claim) {
						await journal.pruneConsumers(
							group,
							this._consumer,
							CONSUMER_IDLE_MS
						);
					}
					const entries = claim
						? await journal.claimDue(
								group,
								this._consumer,
								retry,
								BATCH - inFlight.size,
								handling
							)
						: [];
					const free = BATCH - inFlight.size - entries.length;
					if (free > 0) {
						entries.push(
							...(await journal.readNew(group, this._consumer, free, BLOCK_MS))
						);
					}
					for (const entry of entries) {
						handling.add(entry.id);
						const task = this._process(group, entry).finally(() => {
							inFlight.delete(task);
							handling.delete(entry.id);
						});
						inFlight.add(task);
					}
				} catch (err) {
					if (this._stopped) {
						return;
					}
					getLogger().error("Bus consumer loop failed", {
						context: { topic: group.topic, service: group.service },
						error: normalizeError(err),
					});
					await new Promise((resolve) => setTimeout(resolve, BLOCK_MS));
				}
			}
		} finally {
			await Promise.all(inFlight);
		}
	}

	private async _process(
		group: JournalGroup,
		entry: JournalEntry
	): Promise<void> {
		const { journal, deadStreams, handle, onDeadLetter } = this._options;
		const context = {
			topic: group.topic,
			service: group.service,
			entryId: entry.id,
		};
		try {
			const publisher = entry.message?.metadata?.publisher?.serviceName;
			if (typeof publisher !== "string") {
				const reason =
					"invalid envelope: metadata.publisher.serviceName missing";
				const id = await deadStreams.deadLetter(
					group,
					entry.id,
					entry.message,
					reason,
					entry.deliveries
				);
				MESSAGES_DLQ_TOTAL.inc({ topic: group.topic, reason });
				onDeadLetter?.(group, entry.message, reason, id);
				return;
			}
			// Only a crash gets here past the limit: the classifier below never saw those deliveries.
			if (entry.deliveries > MAX_RETRIES) {
				const reason = DlqReason.MaxRetriesExceeded;
				const id = await deadStreams.deadLetter(
					group,
					entry.id,
					entry.message,
					reason,
					entry.deliveries
				);
				MESSAGES_DLQ_TOTAL.inc({ topic: group.topic, reason });
				onDeadLetter?.(group, entry.message, reason, id);
				return;
			}
			if (!isExpectedPublisher(group.topic, publisher)) {
				PUBLISHER_REJECTED_TOTAL.inc({ topic: group.topic, publisher });
				getLogger().error(
					"Bus entry rejected: publisher not allowed on topic",
					{
						context: { ...context, publisher },
					}
				);
				await journal.ack(group, entry.id);
				return;
			}
			try {
				const abort = new AbortController();
				const running = runInMessageTraceContext(entry.message.metadata, () =>
					handle(entry.message, abort.signal)
				);
				try {
					await withTimeout(
						running,
						HANDLER_TIMEOUT_MS,
						"Bus handler timed out"
					);
				} catch (err) {
					abort.abort(err);
					// The slot stays taken until the handler returns (or the grace ends): concurrency stays bounded by BATCH.
					await Promise.race([
						// biome-ignore lint/plugin: the late error of the abandoned handler is not the failure reported (the timeout is); the grace only waits for its return
						running.catch(() => undefined),
						sleep(ABORT_GRACE_MS),
					]);
					throw err;
				}
				MESSAGES_DELIVERED_TOTAL.inc({ topic: group.topic, status: "success" });
			} catch (err) {
				MESSAGES_DELIVERED_TOTAL.inc({ topic: group.topic, status: "failed" });
				const action = classifyDeliveryError(
					err,
					entry.deliveries as SequenceNumber,
					extractDeliveryParams(entry.message)
				);
				if (action.action === ErrorActionType.DLQ) {
					const id = await deadStreams.deadLetter(
						group,
						entry.id,
						entry.message,
						action.reason,
						entry.deliveries
					);
					MESSAGES_DLQ_TOTAL.inc({ topic: group.topic, reason: action.reason });
					onDeadLetter?.(group, entry.message, action.reason, id);
				} else if (action.action === ErrorActionType.SWALLOW) {
					await journal.ack(group, entry.id);
				}
				// RETRY: left pending, due again after the backoff.
				return;
			}
			await journal.ack(group, entry.id);
		} catch (err) {
			// Left pending: the next claim settles it again.
			getLogger().error("Bus entry not settled", {
				context,
				error: normalizeError(err),
			});
		}
	}
}
