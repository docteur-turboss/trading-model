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

export interface HorizonGenome {
	maxEpisodeLength: PositiveInt;
	nStepReturn: PositiveInt;
	frameSkip: PositiveInt;
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
