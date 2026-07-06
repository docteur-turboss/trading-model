// ================================================================
//                  genome mutation operators
// ================================================================

import type {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LamarckGenome,
	LayerGenome,
	MutationAdaptation,
	MutationGenome,
	NetworkGenome,
	NormalisationType,
	RLGenome,
} from "./genome-types";
import { sampleGaussian, sampleNoise } from "./noise";
import { clamp } from "./utils";

// ----------------------------------------------------------------
// Enum pools
// ----------------------------------------------------------------

const NORM_TYPES: NormalisationType[] = [
	"none",
	"logarithmic-normalization",
	"decimal-scaling",
	"border",
	"min-max",
	"robust-scaling",
	"z-score",
];
const ACTIVATIONS: ActivationType[] = [
	"relu",
	"sigmoid",
	"tanh",
	"leakyReLu",
	"elu",
	"mish",
	"gelu",
	"softmax",
];
const CONNECTION_TYPES: ConnectionType[] = [
	"dense-skip",
	"fully-connected",
	"residual-connection",
];
const BIAS_TYPES: InitialisationType[] = [
	"zeros",
	"random",
	"xavier",
	"he",
	"leCun",
];

function pick<TValue>(arr: TValue[], rng: () => number): TValue {
	return arr[Math.floor(rng() * arr.length)];
}

// ----------------------------------------------------------------
// Sigma adaptation strategies
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// Sigma adaptation strategy interface & implementations
// ----------------------------------------------------------------

interface SigmaAdapter {
	readonly type: MutationAdaptation;
	adapt(mutation: MutationGenome, rng: () => number): number;
}

class FixedSigmaAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = "fixed";
	adapt(mutation: MutationGenome): number {
		return mutation.sigma;
	}
}

class SigmaAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = "sigma_adaptive";
	adapt(mutation: MutationGenome, rng: () => number): number {
		return mutation.sigma * (0.9 + 0.2 * rng());
	}
}

class SelfAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = "self_adaptive";
	adapt(mutation: MutationGenome, rng: () => number): number {
		// Log-normal perturbation of selfSigma (1/5-rule inspired)
		const tau = 1 / Math.sqrt(2 * Math.max(1, mutation.sigma));
		return mutation.selfSigma * Math.exp(tau * sampleGaussian(rng, 1));
	}
}

class CmaSigmaAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = "cma";
	adapt(mutation: MutationGenome): number {
		return mutation.sigma; // Step-size control is external (CMA-ES loop)
	}
}

const SIGMA_ADAPTERS: Record<MutationAdaptation, SigmaAdapter> = {
	fixed: new FixedSigmaAdapter(),
	sigma_adaptive: new SigmaAdaptiveAdapter(),
	self_adaptive: new SelfAdaptiveAdapter(),
	cma: new CmaSigmaAdapter(),
};

/** Compute an adapted mutation sigma based on the configured adaptation strategy. */
export function adaptSigma(
	mutation: MutationGenome,
	rng: () => number
): number {
	const adapter = SIGMA_ADAPTERS[mutation.adaptation];
	return adapter ? adapter.adapt(mutation, rng) : mutation.sigma;
}

// ----------------------------------------------------------------
// Layer mutation
// ----------------------------------------------------------------

/** Mutate a single hidden layer's neuron count, activation, connection type, and bias initialisation. */
export function mutateLayer(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): LayerGenome {
	const sigma = adaptSigma(mutation, rng);
	const clone = { ...layer };

	if (rng() < mutation.rate) {
		const delta = Math.round(
			sampleNoise(mutation.distribution, sigma * 10, rng)
		);
		clone.neurons = Math.max(1, clone.neurons + delta);
	}
	if (mutation.mutateActivations && rng() < mutation.activationMutationRate) {
		clone.activation = pick(ACTIVATIONS, rng);
	}
	if (rng() < mutation.rate * 0.3) {
		clone.connectionType = pick(CONNECTION_TYPES, rng);
	}
	if (rng() < mutation.rate * 0.2) {
		clone.biasType = pick(BIAS_TYPES, rng);
	}
	return clone;
}

// ----------------------------------------------------------------
// RL hyperparameter mutation
// ----------------------------------------------------------------

export interface MutateRLContext {
	rl: RLGenome;
	mutation: MutationGenome;
	_sigma: number;
	rng: () => number;
}

function mutateRL(
	ctx: MutateRLContext
): RLGenome {
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

function _mutateGammaAndLR(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "gamma" | "learningRate"> {
	const perturb = (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);

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
	const perturb = (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);

	return {
		rewardShaping: {
			...rl.rewardShaping,
			clipMin: perturb(rl.rewardShaping.clipMin, 0.1),
			clipMax: perturb(rl.rewardShaping.clipMax, 0.1),
			scaleFactor: Math.max(0.01, perturb(rl.rewardShaping.scaleFactor, 0.1)),
		},
	};
}

function _mutateMaxEpisodeLength(
	horizon: RLGenome["horizon"],
	mutation: MutationGenome,
	rng: () => number
): number {
	return Math.max(10, Math.round(horizon.maxEpisodeLength + sampleNoise(mutation.distribution, 20, rng)));
}

function _mutateDiscreteStepParam(value: number, rng: () => number): number {
	return Math.max(1, Math.round(value + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0)));
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
	const perturb = (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);

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
	const perturb = (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);

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

function _mutateReplayBuffer(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "replayBuffer"> {
	const perturb = (value: number, scale: number) =>
		value + sampleNoise(mutation.distribution, scale, rng);

	return {
		replayBuffer: {
			...rl.replayBuffer,
			bufferSize: Math.max(
				500,
				Math.round(rl.replayBuffer.bufferSize * (0.8 + rng() * 0.4))
			),
			alphaPER: clamp(perturb(rl.replayBuffer.alphaPER, 0.05), 0, 1),
			betaPER: clamp(perturb(rl.replayBuffer.betaPER, 0.05), 0, 1),
		},
	};
}

// ----------------------------------------------------------------
// Full genome mutation
// ----------------------------------------------------------------

/** Apply all configured mutation operators (network structure, RL hyperparameters, self-adaptive params) to a genome. */
export function mutateGenome(
	genome: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const mutationConfig = genome.mutation;
	const sigma = adaptSigma(mutationConfig, rng);

	const network = _mutateNetworkStructure({ genome, mutationConfig, _sigma: sigma, rng });

	const rl: RLGenome = mutationConfig.mutateHyperparams
		? mutateRL({ rl: genome.rl, mutation: mutationConfig, _sigma: sigma, rng })
		: { ...genome.rl };

	const mutation = _mutateSelfAdaptiveParams(mutationConfig, sigma, rng);

	return { ...genome, network, rl, mutation };
}

export interface MutateNetworkContext {
	genome: LamarckGenome;
	mutationConfig: MutationGenome;
	_sigma: number;
	rng: () => number;
}

function _mutateNetworkStructure(
	ctx: MutateNetworkContext
): NetworkGenome {
	const { genome, mutationConfig, rng } = ctx;
	const perLayerMode = mutationConfig.scope === "per_layer";
	const layers: LayerGenome[] = genome.network.hiddenLayers.map((layer) =>
		perLayerMode || rng() < mutationConfig.rate
			? mutateLayer(layer, mutationConfig, rng)
			: { ...layer }
	);

	if (layers.length > 0 && rng() < mutationConfig.addNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = { ...layers[li], neurons: layers[li].neurons + 1 };
	}
	if (layers.length > 0 && rng() < mutationConfig.removeNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = {
			...layers[li],
			neurons: Math.max(1, layers[li].neurons - 1),
		};
	}

	if (rng() < mutationConfig.addLayerRate) {
		const newLayer: LayerGenome = {
			neurons: 16 + Math.floor(rng() * 32),
			activation: pick(ACTIVATIONS, rng),
			connectionType: "dense-skip",
			biasType: "zeros",
		};
		layers.splice(Math.floor(rng() * (layers.length + 1)), 0, newLayer);
	}
	if (layers.length > 1 && rng() < mutationConfig.removeLayerRate) {
		layers.splice(Math.floor(rng() * layers.length), 1);
	}

	return {
		...genome.network,
		hiddenLayers: layers,
		normalization:
			rng() < mutationConfig.rate * 0.2
				? pick(NORM_TYPES, rng)
				: genome.network.normalization,
	};
}

function _mutateSelfAdaptiveParams(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): MutationGenome {
	return {
		...mutationConfig,
		sigma: Math.max(
			1e-5,
			mutationConfig.sigma +
				sampleNoise(mutationConfig.distribution, sigma * 0.1, rng)
		),
		selfSigma: Math.max(
			1e-5,
			mutationConfig.selfSigma + sampleNoise("gaussian", sigma * 0.05, rng)
		),
		rate: clamp(mutationConfig.rate + sampleGaussian(rng, 0.01), 0.001, 0.5),
	};
}
