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

export const RISK_EXPOSURE_RATIO = new promClient.Gauge({
	name: "risk_exposure_ratio",
	help: "Global exposure (positions at their marks) over the allocated capital; compare with globalExposurePct",
	labelNames: ["mode"] as const,
});

export const RISK_DAILY_LOSS = new promClient.Gauge({
	name: "risk_daily_loss",
	help: "Loss since the start of the UTC day, in quote currency (0 when in profit)",
	labelNames: ["mode"] as const,
});

export const RISK_OPEN_ORDERS = new promClient.Gauge({
	name: "risk_open_orders",
	help: "Orders not yet in a final state",
	labelNames: ["mode"] as const,
});

export const RISK_TICK_FAILURES = new promClient.Counter({
	name: "risk_tick_failures_total",
	help: "Risk ticks that threw (state write, reconciliation), by mode",
	labelNames: ["mode"] as const,
});

export { metricsHandler };
