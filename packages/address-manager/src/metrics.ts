import promClient from "prom-client";

/** Counter of registration attempts by result. */
export const REGISTRATION_TOTAL = new promClient.Counter({
	name: "address_manager_registration_total",
	help: "Total number of service registration attempts",
	labelNames: ["result"] as const,
});

/** Counter of heartbeats by result. */
export const HEARTBEAT_TOTAL = new promClient.Counter({
	name: "address_manager_heartbeat_total",
	help: "Total number of heartbeat attempts",
	labelNames: ["result"] as const,
});

/** Outcome of a registration or heartbeat, as a metric label. */
export enum DiscoveryResult {
	Success = "success",
	Failure = "failure",
}
