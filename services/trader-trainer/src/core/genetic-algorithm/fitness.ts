// ================================================================
//            fitness computation & reward shaping
// ================================================================

import type { FitnessType, RewardShapingGenome } from "./genome-types";
import { clamp } from "./utils";

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

	switch (type) {
		case "total_pnl":
			return mean;

		case "sharpe": {
			const variance =
				scores
					.map((value) => (value - mean) ** 2)
					.reduce((sum, value) => sum + value, 0) /
				Math.max(1, scores.length - 1);
			const std = Math.sqrt(variance);
			return std < 1e-10 ? mean : mean / std;
		}

		case "sortino": {
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

		case "calmar": {
			// Calmar = mean return / max drawdown (computed on cumulative returns)
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

		case "composite": {
			const sharpe = computeFitness("sharpe", scores);
			const sortino = computeFitness("sortino", scores);
			return 0.4 * mean + 0.3 * sharpe + 0.3 * sortino;
		}

		default:
			return mean;
	}
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
