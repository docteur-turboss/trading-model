import { NumericRange } from "@trading-model/common/domain/numeric-range";
import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import type { NoiseStd } from "@trading-model/common/domain/primitives/noise-std";
import type { Temperature } from "@trading-model/common/domain/primitives/temperature";
import { crossoverScalar } from "../crossover/strategies";
import type { CrossoverGenome } from "../genome-control";
import type {
	ContinuousPolicyGenome,
	DiscretePolicyGenome,
	HorizonGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
	RLScalars,
} from "./types";

export function crossoverRewardShaping(ctx: {
	left: RewardShapingGenome;
	right: RewardShapingGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}): RewardShapingGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		clip: rng() < 0.5 ? left.clip : right.clip,
		clipBounds: new NumericRange(
			crossoverFn(left.clipBounds.lo, right.clipBounds.lo),
			crossoverFn(left.clipBounds.hi, right.clipBounds.hi)
		),
		scale: rng() < 0.5 ? left.scale : right.scale,
		scaleFactor: crossoverFn(left.scaleFactor, right.scaleFactor) as Percentage,
		normalize: rng() < 0.5 ? left.normalize : right.normalize,
		sparse: rng() < 0.5 ? left.sparse : right.sparse,
	};
}

export function crossoverHorizon(ctx: {
	left: HorizonGenome;
	right: HorizonGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
}): HorizonGenome {
	const { left, right, crossoverFn } = ctx;
	return {
		maxEpisodeLength: Math.round(
			crossoverFn(left.maxEpisodeLength, right.maxEpisodeLength)
		) as PositiveInt,
		nStepReturn: Math.round(
			crossoverFn(left.nStepReturn, right.nStepReturn)
		) as PositiveInt,
		frameSkip: Math.round(
			crossoverFn(left.frameSkip, right.frameSkip)
		) as PositiveInt,
	};
}

export function crossoverDiscretePolicy(ctx: {
	left: DiscretePolicyGenome;
	right: DiscretePolicyGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}): DiscretePolicyGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		type: rng() < 0.5 ? left.type : right.type,
		epsilonStart: crossoverFn(
			left.epsilonStart,
			right.epsilonStart
		) as Probability,
		epsilonMin: crossoverFn(left.epsilonMin, right.epsilonMin) as Probability,
		epsilonDecay: crossoverFn(
			left.epsilonDecay,
			right.epsilonDecay
		) as Probability,
		temperature: crossoverFn(
			left.temperature,
			right.temperature
		) as Temperature,
	};
}

export function crossoverContinuousPolicy(ctx: {
	left: ContinuousPolicyGenome;
	right: ContinuousPolicyGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}): ContinuousPolicyGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		type: rng() < 0.5 ? left.type : right.type,
		clipBounds: new NumericRange(
			crossoverFn(left.clipBounds.lo, right.clipBounds.lo),
			crossoverFn(left.clipBounds.hi, right.clipBounds.hi)
		),
		noiseStd: crossoverFn(left.noiseStd, right.noiseStd) as NoiseStd,
		noiseDecay: crossoverFn(left.noiseDecay, right.noiseDecay) as Probability,
	};
}

export function crossoverReplayBuffer(ctx: {
	left: ReplayBufferGenome;
	right: ReplayBufferGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}): ReplayBufferGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		bufferSize: Math.round(
			crossoverFn(left.bufferSize, right.bufferSize)
		) as PositiveInt,
		prioritized: rng() < 0.5 ? left.prioritized : right.prioritized,
		alphaPER: crossoverFn(left.alphaPER, right.alphaPER) as Probability,
		betaPER: crossoverFn(left.betaPER, right.betaPER) as Probability,
		betaAnneal: rng() < 0.5 ? left.betaAnneal : right.betaAnneal,
	};
}

function _crossoverGammaAndLR(
	left: RLGenome,
	right: RLGenome,
	crossoverFn: (valueA: number, valueB: number) => number
): RLScalars {
	return {
		gamma: crossoverFn(left.gamma, right.gamma) as Probability,
		learningRate: crossoverFn(
			left.learningRate,
			right.learningRate
		) as Percentage,
	};
}

export function crossoverRL(ctx: {
	left: RLGenome;
	right: RLGenome;
	co: CrossoverGenome;
	rng: () => number;
}): RLGenome {
	const { left, right, co, rng } = ctx;
	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar({ left: valueA, right: valueB, co, rng });
	const section = <TLeft, TRight>(left: TLeft, right: TRight) => ({
		left,
		right,
		crossoverFn,
		rng,
	});

	return {
		..._crossoverGammaAndLR(left, right, crossoverFn),
		rewardShaping: crossoverRewardShaping(
			section(left.rewardShaping, right.rewardShaping)
		),
		horizon: crossoverHorizon(section(left.horizon, right.horizon)),
		discretePolicy: crossoverDiscretePolicy(
			section(left.discretePolicy, right.discretePolicy)
		),
		continuousPolicy: crossoverContinuousPolicy(
			section(left.continuousPolicy, right.continuousPolicy)
		),
		replayBuffer: crossoverReplayBuffer(
			section(left.replayBuffer, right.replayBuffer)
		),
	};
}
