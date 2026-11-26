import { metricsHandler } from "@trading-model/http/metrics-handler";
import promClient from "prom-client";

/** `outcome`: hold, a risk-execution status, or `rejected` with its `reason` code (ADR-0064 §2). */
export const DECISION_INTENTS_TOTAL = new promClient.Counter({
	name: "decision_intents_total",
	help: "Decisions of the promoted models, by risk-execution outcome and rejection reason",
	labelNames: ["outcome", "reason"] as const,
});

/** `reason`: not-admissible, unsupported-interval, missing-bar, error. */
export const DECISION_SKIPPED_TOTAL = new promClient.Counter({
	name: "decision_skipped_total",
	help: "Passes of a promoted model that decided nothing, by reason",
	labelNames: ["reason"] as const,
});
// Series exists at 0 from start, so increase() sees the first failure after a pod start (DecisionPassFailing).
DECISION_SKIPPED_TOTAL.inc({ reason: "error" }, 0);

export { metricsHandler };
