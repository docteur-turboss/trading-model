import type { ReplayAuditPort } from "./replay.port";

/** What the use cases write to and read from the DLQ entry store (MongoDB). */
export interface DlqEntryStorePort<TEntry> {
	insert(entry: TEntry): Promise<string>;
	delete(ids: string[]): Promise<number>;
}

/** Counters the use cases move. */
export interface DlqMetricsPort {
	batchReplayed(success: number, failed: number): void;
	entriesDeleted(count: number): void;
}

/** Audit trail of the delete use case. */
export interface DlqAuditPort extends ReplayAuditPort {
	/** Never rejects; false when message-manager did not accept the event (ADR-0059). */
	notifyDelete(
		ids: string[],
		deleted: number,
		actor: string | null
	): Promise<boolean>;
}

/** Pops entry ids from the fast replay queue. */
export interface QueuePopPort {
	shouldSkip(): boolean;
	popEntries(): Promise<string[]>;
}
