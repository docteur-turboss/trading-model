import { NumericRange } from "@trading-model/primitives/numeric-range";
import {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/primitives/primitives";
import { NoiseStd } from "@trading-model/primitives/primitives/noise-std";
import { Temperature } from "@trading-model/primitives/primitives/temperature";
import {
	type ContinuousPolicyGenome,
	ContinuousPolicyType,
	type DiscretePolicyGenome,
	type HorizonGenome,
	type ReplayBufferGenome,
	type RewardShapingGenome,
} from "./types";

export function createRewardShapingGenome(): RewardShapingGenome {
	return {
		clip: false,
		clipBounds: new NumericRange(-1, 1),
		scale: false,
		scaleFactor: Percentage.of(1),
		normalize: false,
		sparse: false,
	};
}

export function createHorizonGenome(): HorizonGenome {
	return {
		maxEpisodeLength: PositiveInt.of(500),
		nStepReturn: PositiveInt.of(1),
		frameSkip: PositiveInt.of(1),
	};
}

export function createDiscretePolicyGenome(): DiscretePolicyGenome {
	return {
		epsilonStart: Probability.of(1.0),
		epsilonMin: Probability.of(0.05),
		epsilonDecay: Probability.of(0.995),
		temperature: Temperature.of(1.0),
	};
}

export function createContinuousPolicyGenome(): ContinuousPolicyGenome {
	return {
		type: ContinuousPolicyType.TanhSquashing,
		clipBounds: new NumericRange(-1, 1),
		noiseStd: NoiseStd.of(0.1),
		noiseDecay: Probability.of(0.999),
	};
}

export function createReplayBufferGenome(): ReplayBufferGenome {
	return {
		bufferSize: PositiveInt.of(10_000),
		prioritized: false,
		alphaPER: Probability.of(0.6),
		betaPER: Probability.of(0.4),
		betaAnneal: true,
	};
}
