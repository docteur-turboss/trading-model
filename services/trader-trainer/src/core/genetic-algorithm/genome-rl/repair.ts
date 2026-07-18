import { NumericRange } from "@trading-model/common/domain/numeric-range";
import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import { NoiseStd } from "@trading-model/common/domain/primitives/noise-std";
import { Temperature } from "@trading-model/common/domain/primitives/temperature";
import { clamp } from "../utils";
import {
	type ContinuousPolicyGenome,
	ContinuousPolicyType,
	type DiscretePolicyGenome,
	DiscretePolicyType,
	type HorizonGenome,
	type ReplayBufferGenome,
	type RewardShapingGenome,
	type RLGenome,
} from "./types";

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
