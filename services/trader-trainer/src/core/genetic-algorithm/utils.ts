/** Clamp a number between `lo` and `hi` inclusive. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Generate a short random alphanumeric identifier. */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

import { NormalizationStats } from '../normalization-stats';

export type RunningStats = NormalizationStats;
/** @deprecated Use `NormalizationStats` instead. */
export const RunningStats = NormalizationStats;

/** Compute the unbiased sample variance of an array of scores. */
export function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length - 1);
}

/** Compute the Sharpe-like ratio (mean / std) for an array of scores. Returns 0 if std is negligible. */
export function computeSharpe(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std = Math.sqrt(computeVariance(scores));
  return std < 1e-8 ? 0 : mean / std;
}
