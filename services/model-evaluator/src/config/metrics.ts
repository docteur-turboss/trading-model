import { metricsHandler } from "@trading-model/http/metrics-handler";
import promClient from "prom-client";

/** `outcome`: recorded | duplicate. A refused model is a failed delivery, not an outcome. */
export const MODEL_EVALUATIONS_TOTAL = new promClient.Counter({
	name: "model_evaluations_total",
	help: "Published models handled by the offline evaluator, by outcome",
	labelNames: ["outcome"] as const,
});

/** Greedy replayed minus trainer-published test Sharpe of the newest model of a symbol (ADR-0079). */
export const MODEL_REPLAY_SHARPE_GAP = new promClient.Gauge({
	name: "model_replay_sharpe_gap",
	help: "Annualised test Sharpe of the greedy replay minus the one the trainer published, newest model per symbol",
	labelNames: ["symbol"] as const,
});

export { metricsHandler };
