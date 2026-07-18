import { EpisodeScores } from "./episode-scores";
import type { RewardShapingGenome } from "./genome-types";
import { FitnessType } from "./genome-types";

type FitnessFn = (scores: EpisodeScores) => number;

const FITNESS_STRATEGIES: Record<FitnessType, FitnessFn> = {
	[FitnessType.TotalPnl]: (scores) => scores.total(),
	[FitnessType.Sharpe]: (scores) => scores.sharpe(),
	[FitnessType.Sortino]: (scores) => scores.sortino(),
	[FitnessType.Calmar]: (scores) => scores.calmar(),
	[FitnessType.Composite]: (scores) => scores.composite(),
};

/**
 * Aggregate episode scores into a single scalar fitness value.
 *
 * @param type    Fitness metric.
 * @param scores  Per-episode returns.
 */
export function computeFitness(
	type: FitnessType,
	scores: EpisodeScores | number[]
): number {
	const wrapped =
		scores instanceof EpisodeScores
			? scores
			: new EpisodeScores(scores as number[]);
	if (wrapped.length === 0) {
		return Number.NEGATIVE_INFINITY;
	}
	const strategy = FITNESS_STRATEGIES[type];
	return strategy ? strategy(wrapped) : wrapped.mean();
}

/**
 * Apply reward transformations before storing to replay buffer.
 * Z-score normalisation is handled externally via running statistics.
 */
export function shapeReward(raw: number, cfg: RewardShapingGenome): number {
	let result = raw;
	if (cfg.scale) {
		result *= cfg.scaleFactor;
	}
	if (cfg.clip) {
		result = cfg.clipBounds.clamp(result);
	}
	return result;
}
