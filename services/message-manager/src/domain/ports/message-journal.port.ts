import type { Message } from "@trading-model/contracts/message-types";
import type { Topic } from "@trading-model/primitives/primitives";

/** One consumer group of the journal: the subscriber service of a topic. */
export interface JournalGroup {
	topic: Topic;
	service: string;
}

export interface JournalEntry {
	/** Position in the topic's log, opaque to callers. */
	id: string;
	message: Message;
	/** Delivery attempts including the one this read starts (shared by the replicas). */
	deliveries: number;
}

/** Backlog of one group: entries not yet acknowledged, read or not. */
export interface JournalGroupLag extends JournalGroup {
	/** Entries delivered and not acknowledged, plus entries never read. */
	pending: number;
	/** Age of the oldest of them, 0 when there is none. */
	oldestPendingAgeMs: number;
}

/**
 * Durable log of the accepted messages (ADR-0048). A message is written once
 * per topic and delivered once per subscriber service: each group keeps its
 * own position and its own pending entries, so the retry state is shared
 * between replicas and survives the loss of one.
 */
export interface MessageJournalPort {
	/** Makes the group exist (idempotent) and known to every replica's workers. */
	register(group: JournalGroup): Promise<void>;
	/**
	 * Writes the message; resolves once it is durable. Creates the groups of
	 * `services` first so that none of them can miss it.
	 */
	append(
		message: Message,
		services: readonly string[],
		/** Replay of a dead letter: only this service's group delivers the entry (ADR-0043). */
		onlyFor?: string
	): Promise<void>;
	/** Every group any replica registered. */
	groups(): Promise<JournalGroup[]>;
	/**
	 * Entries never delivered to the group, now pending for `consumer`. With
	 * `blockMs`, waits up to that long for one when there is none yet.
	 */
	readNew(
		group: JournalGroup,
		consumer: string,
		count: number,
		blockMs?: number
	): Promise<JournalEntry[]>;
	/** Ends the reads waiting in `blockMs` and frees their connections. */
	close?(): void;
	/**
	 * Pending entries whose last attempt is older than `dueAfterMs(deliveries)`
	 * (never below `floorMs`), taken over by `consumer`: whichever replica
	 * owned them, even a dead one.
	 */
	claimDue(
		group: JournalGroup,
		consumer: string,
		retry: { floorMs: number; dueAfterMs: (deliveries: number) => number },
		count: number
	): Promise<JournalEntry[]>;
	/**
	 * Backlog of every group: a bounded number of calls per group, none per
	 * message. Absent when the journal cannot tell (in memory).
	 */
	lag?(): Promise<JournalGroupLag[]>;
	/** The entry is settled (delivered, dead-lettered or dropped for good). */
	ack(group: JournalGroup, id: string): Promise<void>;
}

/** Entries older than this are trimmed, delivered or not: a subscriber gone longer misses them. */
export const JOURNAL_RETENTION_MS = 24 * 60 * 60 * 1000;
