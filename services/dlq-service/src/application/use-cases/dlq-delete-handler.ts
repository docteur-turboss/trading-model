import type {
	DlqAuditPort,
	DlqEntryStorePort,
	DlqMetricsPort,
} from "../../domain/ports/dlq.ports";

export interface DeleteEntriesDeps {
	entries: Pick<DlqEntryStorePort<unknown>, "delete">;
	metrics: Pick<DlqMetricsPort, "entriesDeleted">;
	audit: Pick<DlqAuditPort, "notifyDelete">;
}

export function createDeleteEntries(
	deps: DeleteEntriesDeps
): (ids: string[]) => Promise<{ deleted: number }> {
	return async (ids) => {
		const deleted = await deps.entries.delete(ids);
		deps.metrics.entriesDeleted(deleted);
		deps.audit.notifyDelete(ids, deleted);
		return { deleted };
	};
}
