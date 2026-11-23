import { FitnessType } from "./genetic-algorithm/genome-control";
import type { SimulatorCosts } from "./genetic-algorithm/rl-backend";

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
	/** Costs of the symbol's asset class (ADR-0083); absent: `SIMULATOR_PARAMS`. */
	costs?: SimulatorCosts;
	/** FEATURE_ACTION_SPACE_GENE (ADR-0039): the GA may choose the action set. */
	actionSpaceGene?: boolean;
	/** FEATURE_EVENT_DRIVEN_DECISIONS (ADR-0039): the population decides on market events. */
	eventDriven?: boolean;
	/** FEATURE_INPUT_MASK_GENE (ADR-0082): names of the input groups the genome masks. */
	inputGroups?: string[];
	/** FEATURE_SHARED_TRUNK (ADR-0076 step 1): symbols per generation, in [1, N] of the group; absent: all. */
	symbolsPerGeneration?: number;
	/** ADR-0082: the candle group stays active in every mask. */
	protectCandleGroup?: boolean;
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

/** Symbols per generation of a shared-trunk group of `total` (ADR-0076 step 1): `count` in [1, total], 0 or absent: `max(1, floor(total / 3))`. */
export function symbolsPerGeneration(
	count: number | undefined,
	total: number
): number {
	if (count && count > total) {
		throw new Error(
			`TRAINER_SHARED_TRUNK_SYMBOLS_PER_GENERATION=${count} must be in [1, ${total}] (the number of symbols)`
		);
	}
	return count || Math.max(1, Math.floor(total / 3));
}
