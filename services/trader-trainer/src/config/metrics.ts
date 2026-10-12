import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

export const TRAINING_SESSIONS_TOTAL = new promClient.Counter({
	name: "tt_training_sessions_total",
	help: "Total training sessions",
	labelNames: ["result"] as const,
});

export const TRAINING_DURATION_SECONDS = new promClient.Histogram({
	name: "tt_training_duration_seconds",
	help: "Duration of a training session in seconds",
	buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
});

export const TRAINING_STATUS = new promClient.Gauge({
	name: "tt_training_status",
	help: "Current training status (0=idle, 1=training)",
});

export const CURRENT_GENERATION = new promClient.Gauge({
	name: "tt_current_generation",
	help: "Current GA generation number",
});

export const BEST_FITNESS = new promClient.Gauge({
	name: "tt_best_fitness",
	help: "Best fitness score achieved",
	labelNames: ["symbol"] as const,
});

export const STAGNATION_GENERATIONS = new promClient.Gauge({
	name: "tt_stagnation_generations",
	help: "Consecutive generations without improvement",
});

export const POPULATION_SIZE = new promClient.Gauge({
	name: "tt_population_size",
	help: "Current GA population size",
});

export const MARKET_DATA_BUFFER_SIZE = new promClient.Gauge({
	name: "tt_market_data_buffer_size",
	help: "Current market data buffer entries",
	labelNames: ["symbol"] as const,
});

export const MARKET_DATA_SYMBOLS = new promClient.Gauge({
	name: "tt_market_data_symbols",
	help: "Number of tracked symbols in buffer",
});

export const QLEARNING_TRAIN_ERRORS = new promClient.Counter({
	name: "tt_qlearning_train_errors_total",
	help: "Total Q-learning training step errors",
	labelNames: ["reason"] as const,
});

export { metricsHandler };
