import type {
	ContinuousPolicyGenome,
	DiscretePolicyGenome,
	HorizonGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
	ValidationContext,
} from "../genome";
import { ContinuousPolicyType, DiscretePolicyType } from "../genome";
import { createBounded } from "../bounded";
import { clamp } from "../utils";
import { checkPositiveInt, checkRange, err } from "./utils";

export function validateRL(ctx: ValidationContext, rl: RLGenome): void {
	checkRange({ ...ctx, path: "rl.gamma" }, rl.gamma, 0.8, 0.9999);
	checkRange({ ...ctx, path: "rl.learningRate" }, rl.learningRate, 1e-6, 1e-1);
	validateRewardShaping(ctx, rl.rewardShaping);
	validateHorizon(ctx, rl.horizon);
	validateDiscretePolicy(ctx, rl.discretePolicy);
	validateContinuousPolicy(ctx, rl.continuousPolicy);
	validateReplayBuffer(ctx, rl.replayBuffer);
}

function validateRewardShaping(
	ctx: ValidationContext,
	rs: RewardShapingGenome
): void {
	if (!rs.clipBounds || rs.clipBounds.min >= rs.clipBounds.max) {
		err(
			{ ...ctx, path: "rl.rewardShapingenome.clip" },
			"clipBounds.min must be < clipBounds.max",
			{
				clipMin: rs.clipBounds?.min,
				clipMax: rs.clipBounds?.max,
			}
		);
	}
	checkRange(
		{ ...ctx, path: "rl.rewardShapingenome.scaleFactor" },
		rs.scaleFactor,
		0.001,
		1000
	);
}

function validateHorizon(ctx: ValidationContext, horizon: HorizonGenome): void {
	checkPositiveInt(
		{ ...ctx, path: "rl.horizon.maxEpisodeLength" },
		horizon.maxEpisodeLength,
		10
	);
	checkPositiveInt(
		{ ...ctx, path: "rl.horizon.nStepReturn" },
		horizon.nStepReturn
	);
	checkPositiveInt({ ...ctx, path: "rl.horizon.frameSkip" }, horizon.frameSkip);
}

function validateDiscretePolicy(
	ctx: ValidationContext,
	dp: DiscretePolicyGenome
): void {
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonStart" },
		dp.epsilonStart,
		0.1,
		1.0
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonMin" },
		dp.epsilonMin,
		0.001,
		0.2
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonDecay" },
		dp.epsilonDecay,
		0.9,
		0.9999
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.temperature" },
		dp.temperature,
		0.01,
		100
	);
}

function validateContinuousPolicy(
	ctx: ValidationContext,
	cp: ContinuousPolicyGenome
): void {
	if (!cp.clipBounds || cp.clipBounds.min >= cp.clipBounds.max) {
		err(
			{ ...ctx, path: "rl.continuousPolicy.clip" },
			"clipBounds.min must be < clipBounds.max",
			{
				clipMin: cp.clipBounds?.min,
				clipMax: cp.clipBounds?.max,
			}
		);
	}
	checkRange(
		{ ...ctx, path: "rl.continuousPolicy.noiseStd" },
		cp.noiseStd,
		0.001,
		5
	);
	checkRange(
		{ ...ctx, path: "rl.continuousPolicy.noiseDecay" },
		cp.noiseDecay,
		0.9,
		0.9999
	);
}

function validateReplayBuffer(
	ctx: ValidationContext,
	rb: ReplayBufferGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "rl.replayBuffer.bufferSize" },
		rb.bufferSize,
		100
	);
	checkRange({ ...ctx, path: "rl.replayBuffer.alphaPER" }, rb.alphaPER, 0, 1);
	checkRange({ ...ctx, path: "rl.replayBuffer.betaPER" }, rb.betaPER, 0, 1);
}

function repairRewardShaping(rs: RewardShapingGenome): RewardShapingGenome {
	const rawMin = rs.clipBounds?.min ?? -1;
	const rawMax = rs.clipBounds?.max ?? 1;
	return {
		...rs,
		clipBounds: createBounded(
			Math.min(rawMin, rawMax - 1e-6),
			Math.max(rawMax, rawMin + 1e-6),
		),
		scaleFactor: Math.max(0.001, rs.scaleFactor ?? 1),
	};
}

function repairHorizon(horizon: HorizonGenome): HorizonGenome {
	return {
		maxEpisodeLength: Math.max(10, Math.round(horizon.maxEpisodeLength ?? 500)),
		nStepReturn: Math.max(1, Math.round(horizon.nStepReturn ?? 1)),
		frameSkip: Math.max(1, Math.round(horizon.frameSkip ?? 1)),
	};
}

function repairDiscretePolicy(dp: DiscretePolicyGenome): DiscretePolicyGenome {
	return {
		type: dp.type ?? DiscretePolicyType.EpsilonGreedy,
		epsilonStart: clamp(dp.epsilonStart ?? 1.0, 0.1, 1.0),
		epsilonMin: clamp(dp.epsilonMin ?? 0.05, 0.001, 0.2),
		epsilonDecay: clamp(dp.epsilonDecay ?? 0.995, 0.9, 0.9999),
		temperature: Math.max(0.01, dp.temperature ?? 1.0),
	};
}

function repairContinuousPolicy(
	cp: ContinuousPolicyGenome
): ContinuousPolicyGenome {
	const rawMin = cp.clipBounds?.min ?? -1;
	const rawMax = cp.clipBounds?.max ?? 1;
	return {
		type: cp.type ?? ContinuousPolicyType.TanhSquashing,
		clipBounds: createBounded(
			Math.min(rawMin, rawMax - 1e-6),
			Math.max(rawMax, rawMin + 1e-6),
		),
		noiseStd: Math.max(0.001, cp.noiseStd ?? 0.1),
		noiseDecay: clamp(cp.noiseDecay ?? 0.999, 0.9, 0.9999),
	};
}

function repairReplayBuffer(rb: ReplayBufferGenome): ReplayBufferGenome {
	return {
		bufferSize: Math.max(100, Math.round(rb.bufferSize ?? 10_000)),
		prioritized: rb.prioritized,
		alphaPER: clamp(rb.alphaPER ?? 0.6, 0, 1),
		betaPER: clamp(rb.betaPER ?? 0.4, 0, 1),
		betaAnneal: rb.betaAnneal,
	};
}

export function repairRL(rl: RLGenome): typeof rl {
	return {
		gamma: clamp(rl.gamma ?? 0.99, 0.8, 0.9999),
		learningRate: clamp(rl.learningRate ?? 1e-3, 1e-6, 1e-1),
		rewardShaping: repairRewardShaping(rl.rewardShaping),
		horizon: repairHorizon(rl.horizon),
		discretePolicy: repairDiscretePolicy(rl.discretePolicy),
		continuousPolicy: repairContinuousPolicy(rl.continuousPolicy),
		replayBuffer: repairReplayBuffer(rl.replayBuffer),
	};
}
