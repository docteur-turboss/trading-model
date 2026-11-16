import { randomUUID } from "node:crypto";
import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/primitives/primitives";
import { DELIVERY_ATTEMPT_TIMEOUT_MS, retryDueMs } from "./backoff";
import type { DeadStreams } from "./dead-streams";
import {
	classifyDeliveryError,
	ErrorActionType,
} from "./delivery-error-classifier";
import { extractDeliveryParams } from "./delivery-metadata-extractor";
import type { JournalEntry, JournalGroup } from "./journal.port";
import type { RedisMessageJournal } from "./redis-journal";

const BATCH = 100;
/** A blocking read ends after this long without entry, so the loop sees a stop. */
const BLOCK_MS = 1000;
const CLAIM_EVERY_MS = 2000;

export interface BusConsumerOptions {
	journal: RedisMessageJournal;
	deadStreams: DeadStreams;
	/** Consumer group: the subscriber service, one group per service. */
	service: string;
	/** Name of this replica in the group. */
	consumer?: string;
	/** Throws to retry; a `DeadLetterError` dead-letters at once. */
	handle: (message: Message) => Promise<void>;
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
 * due (backoff and limits of ADR-0048), `XACK` on success.
 * Replicas of a service share the group: one of them gets each entry.
 */
export class BusConsumer {
	private readonly _consumer: string;
	private readonly _loops: Promise<void>[] = [];
	private _stopped = true;

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
	}

	async stop(): Promise<void> {
		this._stopped = true;
		this._options.journal.close();
		await Promise.all(this._loops);
		// A loop between its stop test and a read may have reopened a reader.
		this._options.journal.close();
		this._loops.length = 0;
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
			try {
				await handle(entry.message);
			} catch (err) {
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
