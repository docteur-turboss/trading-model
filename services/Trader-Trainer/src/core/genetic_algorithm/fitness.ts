// ================================================================
//            fitness computation & reward shaping
// ================================================================

import type { FitnessType, RewardShapingGenome } from "./genome_types";
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
  if (scores.length === 0) return -Infinity;

  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;

  switch (type) {
    case "total_pnl":
      return mean;

    case "sharpe": {
      const variance = scores
        .map(v => (v - mean) ** 2)
        .reduce((s, v) => s + v, 0) / Math.max(1, scores.length - 1);
      const std = Math.sqrt(variance);
      return std < 1e-10 ? mean : mean / std;
    }

    case "sortino": {
      const negReturns = scores.filter(v => v < 0);
      const downDev = negReturns.length === 0
        ? 1e-10
        : Math.sqrt(
            negReturns.map(v => v ** 2).reduce((s, v) => s + v, 0) / negReturns.length,
          );
      return mean / downDev;
    }

    case "calmar": {
      // Calmar = mean return / max drawdown (computed on cumulative returns)
      let maxDD = 0;
      let peak  = -Infinity;
      let running = 0;
      for (const r of scores) {
        running += r;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
      }
      return maxDD < 1e-10 ? mean : mean / maxDD;
    }

    case "composite": {
      const sharpe  = computeFitness("sharpe",  scores);
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
  let r = raw;
  if (cfg.scale) r *= cfg.scaleFactor;
  if (cfg.clip)  r = clamp(r, cfg.clipMin, cfg.clipMax);
  return r;
}