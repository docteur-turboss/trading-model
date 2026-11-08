import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

export const EVENTS_INGESTED_TOTAL = new promClient.Counter({
	name: "audit_events_ingested_total",
	help: "Total audit events ingested",
	labelNames: ["topic"] as const,
});

export const EVENTS_STORED_TOTAL = new promClient.Counter({
	name: "audit_events_stored_total",
	help: "Total audit events persisted to MongoDB",
	labelNames: ["status"] as const,
});

/** Another replica took the chain sequence first (ADR-0027). `outcome`: retried | exhausted. */
export const CHAIN_COLLISIONS_TOTAL = new promClient.Counter({
	name: "audit_chain_sequence_collisions_total",
	help: "Chain sequence collisions between writers, by outcome (retried, exhausted)",
	labelNames: ["outcome"] as const,
});

export const EVENTS_QUERY_DURATION_SECONDS = new promClient.Histogram({
	name: "audit_events_query_duration_seconds",
	help: "Audit event query latency in seconds",
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const CHAIN_BROKEN = new promClient.Gauge({
	name: "audit_chain_broken",
	help: "1 when the last verification found the audit chain broken (ADR-0027)",
});

export const CHAIN_VERIFIED_SEQUENCE = new promClient.Gauge({
	name: "audit_chain_verified_sequence",
	help: "Last audit chain sequence verified",
});

export const CHAIN_LAST_VERIFICATION_TIMESTAMP = new promClient.Gauge({
	name: "audit_chain_last_verification_timestamp",
	help: "Unix time of the last completed audit chain verification",
});

export const CHAIN_ANCHORED_SEQUENCE = new promClient.Gauge({
	name: "audit_chain_anchored_sequence",
	help: "Last audit chain sequence anchored in the anchor store",
});

export const CHAIN_LAST_ANCHOR_TIMESTAMP = new promClient.Gauge({
	name: "audit_chain_last_anchor_timestamp",
	help: "Unix time of the last successful anchoring pass",
});

export const CHAIN_ANCHORING_ENABLED = new promClient.Gauge({
	name: "audit_chain_anchoring_enabled",
	help: "1 when an anchor store is configured (AUDIT_ANCHOR_BUCKET)",
});

export { metricsHandler };
