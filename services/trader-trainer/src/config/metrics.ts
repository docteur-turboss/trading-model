import type { Request, Response } from "express";
import promClient from "prom-client";

promClient.collectDefaultMetrics({ prefix: "trainer_" });

export const TRAINING_RUNS_TOTAL = new promClient.Counter({
	name: "trainer_runs_total",
	help: "Total training runs completed",
	labelNames: ["symbol"] as const,
});

export const GENERATIONS_COMPLETED = new promClient.Counter({
	name: "trainer_generations_total",
	help: "Total generations completed across all runs",
	labelNames: ["symbol"] as const,
});

export const POPULATION_SIZE = new promClient.Gauge({
	name: "trainer_population_size",
	help: "Current population size",
	labelNames: ["symbol"] as const,
});

export const BEST_FITNESS = new promClient.Gauge({
	name: "trainer_best_fitness",
	help: "Best fitness score in current population",
	labelNames: ["symbol", "metric"] as const,
});

export const TRAINING_ACTIVE = new promClient.Gauge({
	name: "trainer_active",
	help: "Whether training is currently active (1=yes, 0=no)",
});

export const TRAINING_DURATION_SECONDS = new promClient.Histogram({
	name: "trainer_duration_seconds",
	help: "Training run duration in seconds",
	labelNames: ["symbol"] as const,
	buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
});

export const EVALUATION_DURATION_SECONDS = new promClient.Histogram({
	name: "trainer_evaluation_duration_seconds",
	help: "Single genome evaluation latency in seconds",
	buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

export const MARKET_DATA_PROCESSED = new promClient.Counter({
	name: "trainer_market_data_processed_total",
	help: "Total market data events processed",
	labelNames: ["type"] as const,
});

export function metricsHandler(_req: Request, res: Response): void {
	res.set("Content-Type", promClient.register.contentType);
	promClient.register.metrics().then((data) => res.send(data));
}
