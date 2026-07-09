import { clampToBounded } from "./bounded";
import type { RewardShapingGenome } from "./genome-types";
import { FitnessType } from "./genome-types";

export interface FitnessStrategy {
	readonly type: FitnessType;
	compute(scores: number[], mean: number): number;
}

class TotalPnlStrategy implements FitnessStrategy {
	readonly type: FitnessType = FitnessType.TotalPnl;
	compute(scores: number[], _mean: number): number {
		return scores.reduce((sum, value) => sum + value, 0);
	}
}

class SharpeStrategy implements FitnessStrategy {
	readonly type: FitnessType = FitnessType.Sharpe;
	compute(scores: number[], mean: number): number {
		const variance =
			scores
				.map((value) => (value - mean) ** 2)
				.reduce((sum, value) => sum + value, 0) /
			Math.max(1, scores.length - 1);
		const std = Math.sqrt(variance);
		return std < 1e-10 ? mean : mean / std;
	}
}

class SortinoStrategy implements FitnessStrategy {
	readonly type: FitnessType = FitnessType.Sortino;
	compute(scores: number[], mean: number): number {
		const negReturns = scores.filter((value) => value < 0);
		const downDev =
			negReturns.length === 0
				? 1e-10
				: Math.sqrt(
						negReturns
							.map((value) => value ** 2)
							.reduce((sum, value) => sum + value, 0) / negReturns.length
					);
		return mean / downDev;
	}
}

class CalmarStrategy implements FitnessStrategy {
	readonly type: FitnessType = FitnessType.Calmar;
	compute(scores: number[], mean: number): number {
		let maxDD = 0;
		let peak = Number.NEGATIVE_INFINITY;
		let running = 0;
		for (const result of scores) {
			running += result;
			if (running > peak) {
				peak = running;
			}
			const dd = peak - running;
			if (dd > maxDD) {
				maxDD = dd;
			}
		}
		return maxDD < 1e-10 ? mean : mean / maxDD;
	}
}

class CompositeStrategy implements FitnessStrategy {
	readonly type: FitnessType = FitnessType.Composite;
	private readonly _sharpe = new SharpeStrategy();
	private readonly _sortino = new SortinoStrategy();

	compute(scores: number[], mean: number): number {
		const sharpe = this._sharpe.compute(scores, mean);
		const sortino = this._sortino.compute(scores, mean);
		return 0.4 * mean + 0.3 * sharpe + 0.3 * sortino;
	}
}

const FITNESS_STRATEGIES: Record<FitnessType, FitnessStrategy> = {
	[FitnessType.TotalPnl]: new TotalPnlStrategy(),
	[FitnessType.Sharpe]: new SharpeStrategy(),
	[FitnessType.Sortino]: new SortinoStrategy(),
	[FitnessType.Calmar]: new CalmarStrategy(),
	[FitnessType.Composite]: new CompositeStrategy(),
};

/**
 * Aggregate episode scores into a single scalar fitness value.
 *
 * @param type    Fitness metric.
 * @param scores  Per-episode returns.
 */
function _computeMean(scores: number[]): number {
	return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function computeFitness(type: FitnessType, scores: number[]): number {
	if (scores.length === 0) {
		return Number.NEGATIVE_INFINITY;
	}
	const mean = _computeMean(scores);
	const strategy = FITNESS_STRATEGIES[type];
	return strategy ? strategy.compute(scores, mean) : mean;
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
		result = clampToBounded(result, cfg.clipBounds);
	}
	return result;
}
