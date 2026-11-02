import { NumericRange } from "@trading-model/primitives/numeric-range";
import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/primitives/primitives";
import type { ValidationContext } from "../genome";
import type { ClipBounds } from "../genome-network";
import { checkPositiveInt, checkRange, err } from "../genome-validation/utils";
import { clamp } from "../utils";

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
		epsilonStart: clamp(dp.epsilonStart ?? 1.0, 0.1, 1.0) as Probability,
		epsilonMin: clamp(dp.epsilonMin ?? 0.05, 0.001, 0.2) as Probability,
		epsilonDecay: clamp(dp.epsilonDecay ?? 0.995, 0.9, 0.9999) as Probability,
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
		batchSize: Math.round(
			clamp(rb.batchSize ?? 8, 1, MaxBatchSize)
		) as PositiveInt,
	};
}

export function repairRL(rl: RLGenome): typeof rl {
	return {
		gamma: clamp(rl.gamma ?? 0.99, 0.8, 0.9999) as Probability,
		learningRate: clamp(rl.learningRate ?? 1e-3, 1e-6, 1e-1) as Percentage,
		rewardShaping: _repairRewardShaping(rl.rewardShaping),
		horizon: _repairHorizon(rl.horizon),
		discretePolicy: _repairDiscretePolicy(rl.discretePolicy),
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
	checkRange(
		{ ...ctx, path: "rl.replayBuffer.batchSize" },
		rb.batchSize,
		new NumericRange(1, MaxBatchSize)
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
	_validateReplayBuffer(ctx, rl.replayBuffer);
}
