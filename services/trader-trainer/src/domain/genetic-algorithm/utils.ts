/** Clamp a number between `lo` and `hi` inclusive. */
export function clamp(value: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, value));
}

import type { GenomeId } from "@trading-model/primitives/primitives";

/**
 * Deterministic genome id: unique within a run because each generation
 * numbers its genomes from 0, and a seeded run replays the same ids.
 */
export function makeGenomeId(generation: number, index: number): GenomeId {
	return `g${generation}_${index}` as GenomeId;
}

import type { NormalizationStats } from "../normalization-stats";

export type RunningStats = NormalizationStats;
