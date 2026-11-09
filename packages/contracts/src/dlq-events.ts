/**
 * Events dlq-service publishes on the bus so the audit trail records what
 * happens to undelivered messages (audit-logger subscribes to every topic).
 */
export enum DlqEvent {
	EntryAdded = "dlq.entry.added",
	ReplayCompleted = "dlq.replay.completed",
	EntriesDeleted = "dlq.entries.deleted",
}

export interface DlqEntryAddedPayload {
	/** Id of the stored entry (DLQ API). */
	entryId: string;
	/** Topic of the dead-lettered message, null when unknown. */
	topic: string | null;
	reason: string | null;
	/** Name of the API key that sent it through api-gateway (ADR-0059), null for internal callers. */
	actor: string | null;
}

export interface DlqReplayCompletedPayload {
	batchId: string;
	/** Topic the replay was restricted to, null for every topic. */
	topic: string | null;
	replayed: number;
	failed: number;
	/** API key name of a manual replay (ADR-0059), null for the auto-retry. */
	actor: string | null;
}

export interface DlqEntriesDeletedPayload {
	/** Ids the operator asked to delete. */
	ids: string[];
	deleted: number;
	/** API key name of the operator (ADR-0059), null when not called through api-gateway. */
	actor: string | null;
}

export interface DlqEventMap {
	[DlqEvent.EntryAdded]: DlqEntryAddedPayload;
	[DlqEvent.ReplayCompleted]: DlqReplayCompletedPayload;
	[DlqEvent.EntriesDeleted]: DlqEntriesDeletedPayload;
}

const DLQ_TOPICS = new Set<string>(Object.values(DlqEvent));

/**
 * A dead letter of a DLQ event must not publish another one: while
 * audit-logger is down each would dead-letter the next, without end.
 */
export function isDlqEventTopic(topic: string | null | undefined): boolean {
	return topic !== null && topic !== undefined && DLQ_TOPICS.has(topic);
}
