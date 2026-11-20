import { metricsHandler } from "@trading-model/http/metrics-handler";
import promClient from "prom-client";

/** Every series carries the execution mode (ADR-0064 §6). */
export const RISK_ORDERS_TOTAL = new promClient.Counter({
	name: "risk_orders_total",
	help: "Order intents by mode and outcome (a status, or rejected:<reason>)",
	labelNames: ["mode", "outcome"] as const,
});

export const RISK_KILL_SWITCH = new promClient.Gauge({
	name: "risk_kill_switch",
	help: "1 while the kill switch is engaged, by mode and scope (global or symbol)",
	labelNames: ["mode", "scope"] as const,
});

export const RISK_RECONCILIATION_MISMATCH = new promClient.Gauge({
	name: "risk_reconciliation_mismatch",
	help: "1 when the last reconciliation with the broker found a difference",
	labelNames: ["mode"] as const,
});

export const RISK_MARKET_DATA_AGE_SECONDS = new promClient.Gauge({
	name: "risk_market_data_age_seconds",
	help: "Age of the stalest reference price among the allowed instruments",
	labelNames: ["mode"] as const,
});

export { metricsHandler };
