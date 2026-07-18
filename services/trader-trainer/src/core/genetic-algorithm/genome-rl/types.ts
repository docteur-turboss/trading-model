import { NumericRange } from "@trading-model/common/domain/numeric-range";
import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import { NoiseStd } from "@trading-model/common/domain/primitives/noise-std";
import { Temperature } from "@trading-model/common/domain/primitives/temperature";
import type { ValidationContext } from "../genome";
import type { ClipBounds } from "../genome-network";
import { checkPositiveInt, checkRange, err } from "../genome-validation/utils";
import { clamp } from "../utils";

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

export enum DiscretePolicyType {
	EpsilonGreedy = "epsilon_greedy",
	Softmax = "softmax",
}

export interface DiscretePolicyGenome {
	type: DiscretePolicyType;
	epsilonStart: Probability;
	epsilonMin: Probability;
	epsilonDecay: Probability;
	temperature: Temperature;
}

export enum ContinuousPolicyType {
	ActionClipping = "action_clipping",
	TanhSquashing = "tanh_squashing",
	ExplorationNoise = "exploration_noise",
}

export interface ContinuousPolicyGenome {
	clipBounds: ClipBounds;
	type: ContinuousPolicyType;
	noiseStd: NoiseStd;
	noiseDecay: Probability;
}

export interface ReplayBufferGenome {
	bufferSize: PositiveInt;
	prioritized: boolean;
	alphaPER: Probability;
	betaPER: Probability;
	betaAnneal: boolean;
}

export interface RLScalars {
	gamma: Probability;
	learningRate: Percentage;
}

export interface RLGenome extends RLScalars {
	rewardShaping: RewardShapingGenome;
	horizon: HorizonGenome;
	discretePolicy: DiscretePolicyGenome;
	continuousPolicy: ContinuousPolicyGenome;
	replayBuffer: ReplayBufferGenome;
}

function _repairRewardShaping(rs: RewardShapingGenome): RewardShapingGenome {
	const rawMin = rs.clipBounds?.lo ?? -1;
	const rawMax = rs.clipBounds?.hi ?? 1;
	return {
		...rs,
		clipBounds: new NumericRange(
			Math.min(rawMin, rawMax - 1e-6),
			Math.max(rawMax, rawMin + 1e-6)
		),
		scaleFactor: Math.max(0.001, rs.scaleFactor ?? 1) as Percentage,
	};
}

function _repairHorizon(horizon: HorizonGenome): HorizonGenome {
	return {
		maxEpisodeLength: Math.max(
			10,
			Math.round(horizon.maxEpisodeLength ?? 500)
		) as PositiveInt,
		nStepReturn: Math.max(
			1,
			Math.round(horizon.nStepReturn ?? 1)
		) as PositiveInt,
		frameSkip: Math.max(1, Math.round(horizon.frameSkip ?? 1)) as PositiveInt,
	};
}

function _repairDiscretePolicy(dp: DiscretePolicyGenome): DiscretePolicyGenome {
	return {
		type: dp.type ?? DiscretePolicyType.EpsilonGreedy,
		epsilonStart: clamp(dp.epsilonStart ?? 1.0, 0.1, 1.0) as Probability,
		epsilonMin: clamp(dp.epsilonMin ?? 0.05, 0.001, 0.2) as Probability,
		epsilonDecay: clamp(dp.epsilonDecay ?? 0.995, 0.9, 0.9999) as Probability,
		temperature: Temperature.of(Math.max(0.01, dp.temperature ?? 1.0)),
	};
}

function _repairContinuousPolicy(
	cp: ContinuousPolicyGenome
): ContinuousPolicyGenome {
	const rawMin = cp.clipBounds?.lo ?? -1;
	const rawMax = cp.clipBounds?.hi ?? 1;
	return {
		type: cp.type ?? ContinuousPolicyType.TanhSquashing,
		clipBounds: new NumericRange(
			Math.min(rawMin, rawMax - 1e-6),
			Math.max(rawMax, rawMin + 1e-6)
		),
		noiseStd: NoiseStd.of(Math.max(0.001, cp.noiseStd ?? 0.1)),
		noiseDecay: clamp(cp.noiseDecay ?? 0.999, 0.9, 0.9999) as Probability,
	};
}

function _repairReplayBuffer(rb: ReplayBufferGenome): ReplayBufferGenome {
	return {
		bufferSize: Math.max(
			100,
			Math.round(rb.bufferSize ?? 10_000)
		) as PositiveInt,
		prioritized: rb.prioritized,
		alphaPER: clamp(rb.alphaPER ?? 0.6, 0, 1) as Probability,
		betaPER: clamp(rb.betaPER ?? 0.4, 0, 1) as Probability,
		betaAnneal: rb.betaAnneal,
	};
}

export function repairRL(rl: RLGenome): typeof rl {
	return {
		gamma: clamp(rl.gamma ?? 0.99, 0.8, 0.9999) as Probability,
		learningRate: clamp(rl.learningRate ?? 1e-3, 1e-6, 1e-1) as Percentage,
		rewardShaping: _repairRewardShaping(rl.rewardShaping),
		horizon: _repairHorizon(rl.horizon),
		discretePolicy: _repairDiscretePolicy(rl.discretePolicy),
		continuousPolicy: _repairContinuousPolicy(rl.continuousPolicy),
		replayBuffer: _repairReplayBuffer(rl.replayBuffer),
	};
}

function _validateRewardShaping(
	ctx: ValidationContext,
	rs: RewardShapingGenome
): void {
	if (!rs.clipBounds || rs.clipBounds.lo >= rs.clipBounds.hi) {
		err(
			{ ...ctx, path: "rl.rewardShapingenome.clip" },
			"clipBounds.lo must be < clipBounds.hi",
			{
				clipMin: rs.clipBounds?.lo,
				clipMax: rs.clipBounds?.hi,
			}
		);
	}
	checkRange(
		{ ...ctx, path: "rl.rewardShapingenome.scaleFactor" },
		rs.scaleFactor,
		new NumericRange(0.001, 1000)
	);
}

function _validateHorizon(
	ctx: ValidationContext,
	horizon: HorizonGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "rl.horizon.maxEpisodeLength" },
		horizon.maxEpisodeLength,
		{ min: 10 }
	);
	checkPositiveInt(
		{ ...ctx, path: "rl.horizon.nStepReturn" },
		horizon.nStepReturn
	);
	checkPositiveInt({ ...ctx, path: "rl.horizon.frameSkip" }, horizon.frameSkip);
}

function _validateDiscretePolicy(
	ctx: ValidationContext,
	dp: DiscretePolicyGenome
): void {
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonStart" },
		dp.epsilonStart,
		new NumericRange(0.1, 1.0)
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonMin" },
		dp.epsilonMin,
		new NumericRange(0.001, 0.2)
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonDecay" },
		dp.epsilonDecay,
		new NumericRange(0.9, 0.9999)
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.temperature" },
		dp.temperature,
		new NumericRange(0.01, 100)
	);
}

function _validateContinuousPolicy(
	ctx: ValidationContext,
	cp: ContinuousPolicyGenome
): void {
	if (!cp.clipBounds || cp.clipBounds.lo >= cp.clipBounds.hi) {
		err(
			{ ...ctx, path: "rl.continuousPolicy.clip" },
			"clipBounds.lo must be < clipBounds.hi",
			{
				clipMin: cp.clipBounds?.lo,
				clipMax: cp.clipBounds?.hi,
			}
		);
	}
	checkRange(
		{ ...ctx, path: "rl.continuousPolicy.noiseStd" },
		cp.noiseStd,
		new NumericRange(0.001, 5)
	);
	checkRange(
		{ ...ctx, path: "rl.continuousPolicy.noiseDecay" },
		cp.noiseDecay,
		new NumericRange(0.9, 0.9999)
	);
}

function _validateReplayBuffer(
	ctx: ValidationContext,
	rb: ReplayBufferGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "rl.replayBuffer.bufferSize" },
		rb.bufferSize,
		{ min: 100 }
	);
	checkRange(
		{ ...ctx, path: "rl.replayBuffer.alphaPER" },
		rb.alphaPER,
		new NumericRange(0, 1)
	);
	checkRange(
		{ ...ctx, path: "rl.replayBuffer.betaPER" },
		rb.betaPER,
		new NumericRange(0, 1)
	);
}

export function validateRL(ctx: ValidationContext, rl: RLGenome): void {
	checkRange(
		{ ...ctx, path: "rl.gamma" },
		rl.gamma,
		new NumericRange(0.8, 0.9999)
	);
	checkRange(
		{ ...ctx, path: "rl.learningRate" },
		rl.learningRate,
		new NumericRange(1e-6, 1e-1)
	);
	_validateRewardShaping(ctx, rl.rewardShaping);
	_validateHorizon(ctx, rl.horizon);
	_validateDiscretePolicy(ctx, rl.discretePolicy);
	_validateContinuousPolicy(ctx, rl.continuousPolicy);
	_validateReplayBuffer(ctx, rl.replayBuffer);
}
