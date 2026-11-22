import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/primitives/primitives";
import type { ClipBounds } from "../genome-network/types";

/** Upper bound of the replay minibatch: each stored transition trains on it. */
export const MaxBatchSize = 64;

export interface RewardShapingGenome {
	clipBounds: ClipBounds;
	clip: boolean;
	scale: boolean;
	scaleFactor: Percentage;
	normalize: boolean;
	sparse: boolean;
}

/**
 * When to decide (ADR-0076 §5). Present only behind
 * FEATURE_EVENT_DRIVEN_DECISIONS; `mode` is set at creation and never
 * mutated, so a population shares one network width.
 */
export interface DecisionGenome {
	mode: "every_bar" | "on_event";
	/** |close move| over the event window (fraction) that fires the detector. */
	priceMove: number;
	/** Volume / its standard deviation (`volumeRatio`) that fires the detector. */
	volumeMultiple: number;
	/** Fewest bars between two decisions. */
	minGap: PositiveInt;
}

export interface HorizonGenome {
	maxEpisodeLength: PositiveInt;
	nStepReturn: PositiveInt;
	frameSkip: PositiveInt;
	/** Decision timing; absent: every bar (every `frameSkip` bars). */
	decision?: DecisionGenome;
}

export interface DiscretePolicyGenome {
	epsilonStart: Probability;
	epsilonMin: Probability;
	epsilonDecay: Probability;
}

export interface ReplayBufferGenome {
	bufferSize: PositiveInt;
	prioritized: boolean;
	alphaPER: Probability;
	betaPER: Probability;
	betaAnneal: boolean;
	/** Transitions replayed after each stored one. */
	batchSize: PositiveInt;
}

export interface RLScalars {
	gamma: Probability;
	learningRate: Percentage;
}

export interface RLGenome extends RLScalars {
	rewardShaping: RewardShapingGenome;
	horizon: HorizonGenome;
	discretePolicy: DiscretePolicyGenome;
	replayBuffer: ReplayBufferGenome;
}
