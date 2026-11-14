import { NumericRange } from "@trading-model/primitives/numeric-range";
import {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/primitives/primitives";
import type {
	DiscretePolicyGenome,
	HorizonGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
} from "./types";

function createRewardShapingGenome(): RewardShapingGenome {
	return {
		clip: false,
		clipBounds: new NumericRange(-1, 1),
		scale: false,
		scaleFactor: Percentage.of(1),
		normalize: false,
		sparse: false,
	};
}

function createHorizonGenome(): HorizonGenome {
	return {
		maxEpisodeLength: PositiveInt.of(500),
		nStepReturn: PositiveInt.of(1),
		frameSkip: PositiveInt.of(1),
	};
}

function createDiscretePolicyGenome(): DiscretePolicyGenome {
	return {
		epsilonStart: Probability.of(1.0),
		epsilonMin: Probability.of(0.05),
		epsilonDecay: Probability.of(0.995),
	};
}

function createReplayBufferGenome(): ReplayBufferGenome {
	return {
		bufferSize: PositiveInt.of(10_000),
		prioritized: false,
		alphaPER: Probability.of(0.6),
		betaPER: Probability.of(0.4),
		betaAnneal: true,
		batchSize: PositiveInt.of(8),
	};
}

export function createRLGenome(): RLGenome {
	return {
		// 0.9: over 24 seeded markets, 0.99 learned in 14 of them, 0.9 in 19
		// (ADR-0025); the GA still evolves it within [0.8, 0.9999].
		gamma: Probability.of(0.9),
		learningRate: Percentage.of(1e-3),
		rewardShaping: createRewardShapingGenome(),
		horizon: createHorizonGenome(),
		discretePolicy: createDiscretePolicyGenome(),
		replayBuffer: createReplayBufferGenome(),
	};
}
