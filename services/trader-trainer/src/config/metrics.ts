import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

/** Model artifacts written after a training (ADR-0022): stored, skipped or error. */
export const MODEL_ARTIFACTS_TOTAL = new promClient.Counter({
	name: "tt_model_artifacts_total",
	help: "Model artifacts written after a successful training, by result",
	labelNames: ["result"] as const,
});
// Every result exists at 0 from startup: the first error is then an increase
// for the ModelArtifactWriteFailing alert, not a new series it cannot see.
for (const result of ["stored", "skipped", "error"] as const) {
	MODEL_ARTIFACTS_TOTAL.inc({ result }, 0);
}

/** ADR-0030 verdict of each stored model on its test segment (ADR-0069). */
export const MODEL_ADMISSION_TOTAL = new promClient.Counter({
	name: "tt_model_admission_total",
	help: "Stored models by ADR-0030 verdict on the test segment: admissible or rejected",
	labelNames: ["result"] as const,
});
for (const result of ["admissible", "rejected"] as const) {
	MODEL_ADMISSION_TOTAL.inc({ result }, 0);
}

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

// Between two genomes the trainer yields to the event loop (PR #477): the
// longest evaluation is the longest block of heartbeats, /metrics and candles.
export const GENOME_EVALUATION_SECONDS = new promClient.Histogram({
	name: "tt_genome_evaluation_seconds",
	help: "Duration of the evaluation of one genome on every window (event loop blocked)",
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

// Parents with different weight lengths (diverging architectures) are crossed by
// copying one parent: expected, so counted here instead of logged per crossover.
export const CROSSOVER_FALLBACK_TOTAL = new promClient.Counter({
	name: "tt_crossover_fallback_total",
	help: "Crossovers that copied a parent's weights because the parents' weight lengths differ",
});

export const TRAINING_LEADER = new promClient.Gauge({
	name: "tt_training_leader",
	help: "1 while this instance holds the trainer lease and trains, 0 otherwise (ADR-0058; alert TrainerNoLeader)",
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

// Out-of-sample quality of the newest stored model of each symbol, set at each
// stored model. `segment` names the bars measured: `test` (ADR-0068), or
// `validation` for a run without a test segment.
const MODEL_LABELS = ["symbol", "segment"] as const;

export const MODEL_SHARPE = new promClient.Gauge({
	name: "tt_model_sharpe",
	help: "Annualised Sharpe of the newest stored model on its evaluation segment",
	labelNames: MODEL_LABELS,
});

export const MODEL_RETURN = new promClient.Gauge({
	name: "tt_model_return",
	help: "Mean wallet PnL per evaluation episode of the newest stored model",
	labelNames: MODEL_LABELS,
});

export const MODEL_MAX_DRAWDOWN = new promClient.Gauge({
	name: "tt_model_max_drawdown",
	help: "Largest fall of the cumulative evaluation PnL of the newest stored model",
	labelNames: MODEL_LABELS,
});

export const MODEL_BUY_AND_HOLD_SHARPE = new promClient.Gauge({
	name: "tt_model_buy_and_hold_sharpe",
	help: "Annualised Sharpe of buy and hold on the bars the newest stored model was measured on",
	labelNames: MODEL_LABELS,
});

// In memory: a restart starts the streak again (alert ModelBelowBuyAndHold).
export const MODEL_BELOW_BUY_AND_HOLD_STREAK = new promClient.Gauge({
	name: "tt_model_below_buy_and_hold_streak",
	help: "Consecutive stored models whose Sharpe is below buy and hold, since startup",
	labelNames: ["symbol"] as const,
});

export const FEATURE_DRIFT_SCORE = new promClient.Gauge({
	name: "tt_feature_drift_score",
	help: "Max |live mean - model mean| / model std of the normalized fields received since the newest stored model (alert TrainerFeatureDrift)",
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

// Grows with every candle the trainer receives: flat means the market data
// stopped reaching it (alert TrainerMarketDataStale).
export const MARKET_DATA_RECEIVED_TOTAL = new promClient.Counter({
	name: "tt_market_data_received_total",
	help: "Total market data candles added to the buffer",
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
