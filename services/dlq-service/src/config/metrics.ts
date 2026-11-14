import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

export const metrics = {
	entriesAdded: new promClient.Counter({
		name: "dlq_entries_added_total",
		help: "Total number of DLQ entries added",
	}),
	entriesDeleted: new promClient.Counter({
		name: "dlq_entries_deleted_total",
		help: "Total number of DLQ entries deleted",
	}),
	entriesReplayed: new promClient.Counter({
		name: "dlq_entries_replayed_total",
		help: "Total number of DLQ entries successfully replayed",
	}),
	entriesReplayFailed: new promClient.Counter({
		name: "dlq_entries_replay_failed_total",
		help: "Total number of DLQ entries that failed replay",
	}),
	entriesPruned: new promClient.Counter({
		name: "dlq_entries_pruned_total",
		help: "Total number of old DLQ entries pruned",
	}),
	pruneErrors: new promClient.Counter({
		name: "dlq_prune_errors_total",
		help: "Total number of prune operation errors",
	}),
	auditPublishFailures: new promClient.Counter({
		name: "dlq_audit_publish_failures_total",
		help: "DLQ events message-manager did not accept: missing from the audit trail (ADR-0059)",
		labelNames: ["event"] as const,
	}),
	collectionSize: new promClient.Gauge({
		name: "dlq_collection_size",
		help: "Current number of entries in the DLQ collection",
	}),
};

// Exposed at 0 from start: a series born at 1 is invisible to increase() and DlqAuditEventLost would miss the first loss.
for (const event of Object.values(DlqEvent)) {
	metrics.auditPublishFailures.inc({ event }, 0);
}

export { metricsHandler };
