import { metricsHandler } from "@trading-model/http/metrics-handler";
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

/** Stored models whose publication failed (issue #1739): the leader retries every cycle. */
export const MODEL_PUBLISH_FAILURES_TOTAL = new promClient.Counter({
	name: "tt_model_publish_failures_total",
	help: "Failed publications of a stored model on the bus",
	labelNames: ["symbol"] as const,
});

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

// Training runs in a worker_thread: this is the evaluation time per genome, not API event-loop blocking.
export const GENOME_EVALUATION_SECONDS = new promClient.Histogram({
	name: "tt_genome_evaluation_seconds",
	help: "Duration of the evaluation of one genome on every window",
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
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

export const MARKET_DATA_BUFFER_SIZE = new promClient.Gauge({
	name: "tt_market_data_buffer_size",
	help: "Current market data buffer entries",
	labelNames: ["symbol"] as const,
});

// High for every symbol: the scraper stopped feeding MySQL (alert TrainerMarketDataStale).
export const LAST_CANDLE_AGE_SECONDS = new promClient.Gauge({
	name: "tt_last_candle_age_seconds",
	help: "Age of the newest candle of the stored window, read at the last training session",
	labelNames: ["symbol"] as const,
});

export const SIGNAL_WINDOW_SIZE = new promClient.Gauge({
	name: "tt_signal_window_size",
	help: "Signals of the symbol's asset in the point-in-time window read at the last training session",
	labelNames: ["symbol", "dimension"] as const,
});

export const SIGNAL_NEWEST_AGE_SECONDS = new promClient.Gauge({
	name: "tt_signal_newest_age_seconds",
	help: "Age of the newest signal of the window per dimension, at the last training session",
	labelNames: ["symbol", "dimension"] as const,
});

export const SIGNAL_READ_ERRORS_TOTAL = new promClient.Counter({
	name: "tt_signal_read_errors_total",
	help: "Signal windows that could not be read (the session trains without them)",
	labelNames: ["symbol"] as const,
});

export const DAILY_BAR_ISSUES_TOTAL = new promClient.Counter({
	name: "tt_daily_bar_issues_total",
	help: "Candles dropped or suspect: daily bar incomplete_day, split_suspect, or a candle whose low/high do not bound open/close (ohlc_inconsistent)",
	labelNames: ["symbol", "issue"] as const,
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

const INPUT_GROUP_ACTIVE = new promClient.Gauge({
	name: "tt_input_group_active",
	help: "Share of genomes with the input group active: scope population (last generation) or published (ADR-0082)",
	labelNames: ["group", "scope"] as const,
});

/** Sets `tt_input_group_active` for `scope` from the genomes' masks. */
export function reportInputGroups(
	scope: "population" | "published",
	groups: readonly string[],
	masks: readonly (readonly boolean[])[]
): void {
	groups.forEach((group, index) => {
		const active = masks.filter((mask) => mask[index]).length;
		INPUT_GROUP_ACTIVE.set({ group, scope }, active / (masks.length || 1));
	});
}
