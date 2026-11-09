import type { Topic } from "@trading-model/primitives/primitives";
import type { ReplayAuditPort } from "./replay.ports";

/** What the use cases write to and read from the DLQ entry store (MongoDB). */
export interface DlqEntryStorePort<TEntry> {
	insert(entry: TEntry): Promise<string>;
	delete(ids: string[]): Promise<number>;
}

/** Whether the store takes writes right now (database connected). */
export interface StorageAvailabilityPort {
	isAvailable(): boolean;
}

/** Hands a new entry to the fast replay queue; never throws (the queue is optional). */
export interface EntryEnqueuePort {
	enqueue(entryId: string): Promise<void>;
}

/** Counters the use cases move. */
export interface DlqMetricsPort {
	entryAdded(): void;
	batchReplayed(success: number, failed: number): void;
	entriesDeleted(count: number): void;
}

/** Audit trail of the add and delete use cases. */
export interface DlqAuditPort extends ReplayAuditPort {
	notifyAdd(
		id: string,
		topic: Topic | undefined,
		reason: string | undefined
	): void;
	notifyDelete(ids: string[], deleted: number): void;
}

/** Pops entry ids from the fast replay queue. */
export interface QueuePopPort {
	shouldSkip(): boolean;
	popEntries(): Promise<string[]>;
}
