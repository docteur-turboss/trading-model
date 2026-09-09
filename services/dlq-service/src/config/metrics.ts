import { createMetricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import type { RequestHandler } from "express";
import promClient from "prom-client";

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

export const metrics = {
	entriesAdded: new promClient.Counter({
		name: "dlq_entries_added_total",
		help: "Total number of DLQ entries added",
		registers: [register],
	}),
	entriesDeleted: new promClient.Counter({
		name: "dlq_entries_deleted_total",
		help: "Total number of DLQ entries deleted",
		registers: [register],
	}),
	entriesReplayed: new promClient.Counter({
		name: "dlq_entries_replayed_total",
		help: "Total number of DLQ entries successfully replayed",
		registers: [register],
	}),
	entriesReplayFailed: new promClient.Counter({
		name: "dlq_entries_replay_failed_total",
		help: "Total number of DLQ entries that failed replay",
		registers: [register],
	}),
	entriesPruned: new promClient.Counter({
		name: "dlq_entries_pruned_total",
		help: "Total number of old DLQ entries pruned",
		registers: [register],
	}),
	pruneErrors: new promClient.Counter({
		name: "dlq_prune_errors_total",
		help: "Total number of prune operation errors",
		registers: [register],
	}),
	entrySizeBytes: new promClient.Histogram({
		name: "dlq_entry_size_bytes",
		help: "Size distribution of DLQ entry payloads in bytes",
		buckets: [1024, 5120, 10240, 51200, 102400, 512000, 1048576, 5242880],
		registers: [register],
	}),
	collectionSize: new promClient.Gauge({
		name: "dlq_collection_size",
		help: "Current number of entries in the DLQ collection",
		registers: [register],
	}),
};

export const metricsHandler: RequestHandler = createMetricsHandler(register);
