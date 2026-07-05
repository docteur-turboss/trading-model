// ================================================================
//            fitness computation & reward shaping
// ================================================================

import type { FitnessType, RewardShapingGenome } from "./genome-types";
import { clamp } from "./utils";

// ----------------------------------------------------------------
// Fitness strategy interface & implementations
// ----------------------------------------------------------------

export interface FitnessStrategy {
	readonly type: FitnessType;
	compute(scores: number[], mean: number): number;
}

class TotalPnlStrategy implements FitnessStrategy {
	readonly type: FitnessType = "total_pnl";
	compute(_scores: number[], mean: number): number {
		return mean;
	}
}

class SharpeStrategy implements FitnessStrategy {
	readonly type: FitnessType = "sharpe";
	compute(scores: number[], mean: number): number {
		const variance =
			scores
				.map((value) => (value - mean) ** 2)
				.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length - 1);
		const std = Math.sqrt(variance);
		return std < 1e-10 ? mean : mean / std;
	}
}

class SortinoStrategy implements FitnessStrategy {
	readonly type: FitnessType = "sortino";
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
	readonly type: FitnessType = "calmar";
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
	readonly type: FitnessType = "composite";
	private readonly _sharpe = new SharpeStrategy();
	private readonly _sortino = new SortinoStrategy();

	compute(scores: number[], mean: number): number {
		const sharpe = this._sharpe.compute(scores, mean);
		const sortino = this._sortino.compute(scores, mean);
		return 0.4 * mean + 0.3 * sharpe + 0.3 * sortino;
	}
}

const FITNESS_STRATEGIES: Record<FitnessType, FitnessStrategy> = {
	total_pnl: new TotalPnlStrategy(),
	sharpe: new SharpeStrategy(),
	sortino: new SortinoStrategy(),
	calmar: new CalmarStrategy(),
	composite: new CompositeStrategy(),
};

// ----------------------------------------------------------------
// Fitness aggregation
// ----------------------------------------------------------------

/**
 * Aggregate episode scores into a single scalar fitness value.
 *
 * @param type    Fitness metric.
 * @param scores  Per-episode returns.
 */
export function computeFitness(type: FitnessType, scores: number[]): number {
	if (scores.length === 0) {
		return Number.NEGATIVE_INFINITY;
	}

	const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
	const strategy = FITNESS_STRATEGIES[type];
	return strategy ? strategy.compute(scores, mean) : mean;
}

// ----------------------------------------------------------------
// Reward shaping
// ----------------------------------------------------------------

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
		result = clamp(result, cfg.clipMin, cfg.clipMax);
	}
	return result;
}
