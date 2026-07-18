import { NumericRange } from "@trading-model/common/domain/numeric-range";
import type { ValidationContext } from "../genome";
import { checkPositiveInt, checkRange, err } from "../genome-validation/utils";
import type {
	ContinuousPolicyGenome,
	DiscretePolicyGenome,
	HorizonGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
} from "./types";

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
