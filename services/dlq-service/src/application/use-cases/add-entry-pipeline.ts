import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import type {
	DlqAuditPort,
	DlqEntryStorePort,
	DlqMetricsPort,
	EntryEnqueuePort,
	StorageAvailabilityPort,
} from "../../domain/ports/dlq.ports";
import {
	failSpanOnStorageError,
	isDlqCapacityError,
	rejectSpan,
} from "../../shared/dlq-error-builder";
import { checkEntryAcceptable, type EntryRejection } from "./dlq-validator";

const tracer = trace.getTracer(ServiceInstanceName.DlqService);

/** Outcome of adding an entry; the inbound adapter maps it to an HTTP response. */
export type AddEntryResult =
	| { status: "added"; id: string }
	| { status: "rejected"; reason: EntryRejection }
	| { status: "capacity-reached" }
	| { status: "storage-error" };

export interface AddEntryDeps {
	entries: DlqEntryStorePort<DlqEntry>;
	storage: StorageAvailabilityPort;
	queue: EntryEnqueuePort;
	metrics: Pick<DlqMetricsPort, "entryAdded">;
	audit: Pick<DlqAuditPort, "notifyAdd">;
}

const REJECTION_MESSAGES: Record<EntryRejection, string> = {
	"too-large": "Message payload exceeds maximum size of 5MB",
	"storage-unavailable": "Storage unavailable",
};

async function _persist(
	deps: AddEntryDeps,
	entry: DlqEntry,
	actor: string | null,
	span: Span
): Promise<string> {
	const id = await deps.entries.insert(entry);
	span.setAttribute("entryId", id);
	deps.metrics.entryAdded();
	await deps.queue.enqueue(id);
	deps.audit.notifyAdd(id, entry.topic, entry.reason, actor);
	return id;
}

export function createAddEntry(
	deps: AddEntryDeps
): (entry: DlqEntry, actor: string | null) => Promise<AddEntryResult> {
	return (entry, actor) =>
		tracer.startActiveSpan(
			"dlq-add-entry",
			async (span): Promise<AddEntryResult> => {
				span.setAttribute("topic", entry.topic ?? "");
				span.setAttribute("reason", entry.reason ?? "");
				const reason = checkEntryAcceptable(
					entry.message,
					deps.storage.isAvailable()
				);
				if (reason) {
					rejectSpan(span, REJECTION_MESSAGES[reason]);
					return { status: "rejected", reason };
				}
				try {
					const id = await _persist(deps, entry, actor, span);
					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
					return { status: "added", id };
				} catch (err) {
					if (isDlqCapacityError(err)) {
						rejectSpan(span, "DLQ capacity limit reached");
						return { status: "capacity-reached" };
					}
					failSpanOnStorageError(span, err);
					return { status: "storage-error" };
				}
			}
		);
}
