import { createBounded } from "../bounded";
import type { MutationGenome, RLGenome } from "../genome-types";
import { sampleGaussian, sampleNoise } from "../noise";
import { clamp } from "../utils";

export interface MutateRLContext {
	rl: RLGenome;
	mutation: MutationGenome;
	sigma: number;
	rng: () => number;
}

export function mutateRL(ctx: MutateRLContext): RLGenome {
	const { rl, mutation, rng } = ctx;
	return {
		..._mutateGammaAndLR(rl, mutation, rng),
		..._mutateRewardShaping(rl, mutation, rng),
		..._mutateHorizon(rl, mutation, rng),
		..._mutateDiscretePolicy(rl, mutation, rng),
		..._mutateContinuousPolicy(rl, mutation, rng),
		..._mutateReplayBuffer(rl, mutation, rng),
	};
}

function _perturbFn(
	mutation: MutationGenome,
	rng: () => number
): (value: number, scale: number) => number {
	return (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);
}

function _mutateGammaAndLR(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): import("../genome-types").RLScalars {
	const perturb = _perturbFn(mutation, rng);

	return {
		gamma: clamp(perturb(rl.gamma, 0.01), 0.8, 0.9999),
		learningRate: clamp(
			rl.learningRate * Math.exp(sampleGaussian(rng, 0.3)),
			1e-6,
			1e-1
		),
	};
}

function _mutateRewardShaping(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "rewardShaping"> {
	const perturb = _perturbFn(mutation, rng);

	return {
		rewardShaping: {
			...rl.rewardShaping,
			clipBounds: createBounded(
				perturb(rl.rewardShaping.clipBounds.min, 0.1),
				perturb(rl.rewardShaping.clipBounds.max, 0.1)
			),
			scaleFactor: Math.max(0.01, perturb(rl.rewardShaping.scaleFactor, 0.1)),
		},
	};
}

function _mutateMaxEpisodeLength(
	horizon: RLGenome["horizon"],
	mutation: MutationGenome,
	rng: () => number
): number {
	return Math.max(
		10,
		Math.round(
			horizon.maxEpisodeLength + sampleNoise(mutation.distribution, 20, rng)
		)
	);
}

function _mutateDiscreteStepParam(value: number, rng: () => number): number {
	return Math.max(
		1,
		Math.round(value + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0))
	);
}

function _mutateHorizon(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "horizon"> {
	return {
		horizon: {
			maxEpisodeLength: _mutateMaxEpisodeLength(rl.horizon, mutation, rng),
			nStepReturn: _mutateDiscreteStepParam(rl.horizon.nStepReturn, rng),
			frameSkip: _mutateDiscreteStepParam(rl.horizon.frameSkip, rng),
		},
	};
}

function _mutateDiscretePolicy(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "discretePolicy"> {
	const perturb = _perturbFn(mutation, rng);
	return {
		discretePolicy: {
			...rl.discretePolicy,
			epsilonStart: clamp(
				perturb(rl.discretePolicy.epsilonStart, 0.05),
				0.1,
				1.0
			),
			epsilonMin: clamp(
				perturb(rl.discretePolicy.epsilonMin, 0.01),
				0.001,
				0.2
			),
			epsilonDecay: clamp(
				perturb(rl.discretePolicy.epsilonDecay, 0.002),
				0.9,
				0.9999
			),
			temperature: Math.max(0.01, perturb(rl.discretePolicy.temperature, 0.1)),
		},
	};
}

function _mutateContinuousPolicy(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "continuousPolicy"> {
	const perturb = _perturbFn(mutation, rng);
	return {
		continuousPolicy: {
			...rl.continuousPolicy,
			noiseStd: Math.max(0.001, perturb(rl.continuousPolicy.noiseStd, 0.02)),
			noiseDecay: clamp(
				perturb(rl.continuousPolicy.noiseDecay, 0.001),
				0.9,
				0.9999
			),
		},
	};
}

function _mutateReplayBufferSize(
	bufferSize: number,
	rng: () => number
): number {
	return Math.max(500, Math.round(bufferSize * (0.8 + rng() * 0.4)));
}

function _mutateReplayBuffer(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "replayBuffer"> {
	const perturb = _perturbFn(mutation, rng);
	return {
		replayBuffer: {
			...rl.replayBuffer,
			bufferSize: _mutateReplayBufferSize(rl.replayBuffer.bufferSize, rng),
			alphaPER: clamp(perturb(rl.replayBuffer.alphaPER, 0.05), 0, 1),
			betaPER: clamp(perturb(rl.replayBuffer.betaPER, 0.05), 0, 1),
		},
	};
}
