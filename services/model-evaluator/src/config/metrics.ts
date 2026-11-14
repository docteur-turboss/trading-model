import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

/** `outcome`: recorded | duplicate. A refused model is a failed delivery, not an outcome. */
export const MODEL_EVALUATIONS_TOTAL = new promClient.Counter({
	name: "model_evaluations_total",
	help: "Published models handled by the offline evaluator, by outcome",
	labelNames: ["outcome"] as const,
});

export { metricsHandler };
