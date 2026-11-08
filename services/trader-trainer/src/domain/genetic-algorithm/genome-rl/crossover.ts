import { NumericRange } from "@trading-model/primitives/numeric-range";
import type {
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
	RLScalars,
} from "./types";

function crossoverRewardShaping(ctx: {
	left: RewardShapingGenome;
	right: RewardShapingGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}): RewardShapingGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		clip: rng() < 0.5 ? left.clip : right.clip,
		clipBounds: (() => {
			const lo = crossoverFn(left.clipBounds.lo, right.clipBounds.lo);
			const hi = crossoverFn(left.clipBounds.hi, right.clipBounds.hi);
			return new NumericRange(Math.min(lo, hi - 1e-6), Math.max(hi, lo + 1e-6));
		})(),
		scale: rng() < 0.5 ? left.scale : right.scale,
		scaleFactor: crossoverFn(left.scaleFactor, right.scaleFactor) as Percentage,
		normalize: rng() < 0.5 ? left.normalize : right.normalize,
		sparse: rng() < 0.5 ? left.sparse : right.sparse,
	};
}

function crossoverHorizon(ctx: {
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

function crossoverDiscretePolicy(ctx: {
	left: DiscretePolicyGenome;
	right: DiscretePolicyGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
}): DiscretePolicyGenome {
	const { left, right, crossoverFn } = ctx;
	return {
		epsilonStart: crossoverFn(
			left.epsilonStart,
			right.epsilonStart
		) as Probability,
		epsilonMin: crossoverFn(left.epsilonMin, right.epsilonMin) as Probability,
		epsilonDecay: crossoverFn(
			left.epsilonDecay,
			right.epsilonDecay
		) as Probability,
	};
}

function crossoverReplayBuffer(ctx: {
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
		batchSize: Math.round(
			crossoverFn(left.batchSize, right.batchSize)
		) as PositiveInt,
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
	rng: () => number;
}): RLGenome {
	const { left, right, rng } = ctx;
	// Uniform crossover: each gene comes from either parent with probability 0.5.
	const crossoverFn = (valueA: number, valueB: number) =>
		rng() < 0.5 ? valueA : valueB;
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
		replayBuffer: crossoverReplayBuffer(
			section(left.replayBuffer, right.replayBuffer)
		),
	};
}
