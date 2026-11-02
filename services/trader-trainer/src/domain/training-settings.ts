import type { FitnessType } from "./genetic-algorithm/genome-control";

/** Training hyper-parameters, resolved from the environment by the composition root. */
export interface TrainingSettings {
	/** Fraction of each window kept for validation (0..1). */
	validationSplit: number;
	walkForwardFolds: number;
	generations: number;
	populationSize: number;
	timeBudgetMs: number;
	episodesPerIndividual: number;
	/** Scalar fitness: parent selection, stagnation, published genome (ADR-0025). */
	fitnessType: FitnessType;
	/** Show the agent its position (default true, ADR-0025). */
	observePosition?: boolean;
	/**
	 * Added to the default PRNG seeds (0 = defaults): independent, still
	 * reproducible runs on the same data (MT4 walk-forward, ADR-0030).
	 */
	seedOffset?: number;
}
