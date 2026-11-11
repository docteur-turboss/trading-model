import type {
	DlqAuditPort,
	DlqEntryStorePort,
	DlqMetricsPort,
} from "../../domain/ports/dlq.port";

export interface DeleteEntriesDeps {
	entries: Pick<DlqEntryStorePort<unknown>, "delete">;
	metrics: Pick<DlqMetricsPort, "entriesDeleted">;
	audit: Pick<DlqAuditPort, "notifyDelete">;
}

/** `auditRecorded` false: deleted, but message-manager refused the audit event (ADR-0059). */
export interface DeleteEntriesResult {
	deleted: number;
	auditRecorded: boolean;
}

export function createDeleteEntries(
	deps: DeleteEntriesDeps
): (ids: string[], actor: string | null) => Promise<DeleteEntriesResult> {
	return async (ids, actor) => {
		const deleted = await deps.entries.delete(ids);
		deps.metrics.entriesDeleted(deleted);
		const auditRecorded = await deps.audit.notifyDelete(ids, deleted, actor);
		return { deleted, auditRecorded };
	};
}
