import { FitnessType } from "./genetic-algorithm/genome-control";

/** Training hyper-parameters, resolved from the environment by the composition root. */
export interface TrainingSettings {
	/** Fraction of the steps kept for validation, the selection (0..1). */
	validationSplit: number;
	/** Newest fraction of the steps kept for the final test, never selected on (0..1). */
	testSplit: number;
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

/** Fitness actually used: the risk-adjusted ones sit behind FEATURE_RISK_ADJUSTED_FITNESS (ADR-0039). */
export function effectiveFitnessType(settings: {
	TRAINER_FITNESS_TYPE: FitnessType;
	FEATURE_RISK_ADJUSTED_FITNESS?: boolean;
}): FitnessType {
	return settings.FEATURE_RISK_ADJUSTED_FITNESS === false
		? FitnessType.TotalPnl
		: settings.TRAINER_FITNESS_TYPE;
}
