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
	entrySizeBytes: new promClient.Histogram({
		name: "dlq_entry_size_bytes",
		help: "Size distribution of DLQ entry payloads in bytes",
		buckets: [1024, 5120, 10240, 51200, 102400, 512000, 1048576, 5242880],
	}),
	collectionSize: new promClient.Gauge({
		name: "dlq_collection_size",
		help: "Current number of entries in the DLQ collection",
	}),
};

export { metricsHandler };
