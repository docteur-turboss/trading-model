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
	readonly type: MutationAdaptation = MutationAdaptation.Fixed;
	adapt(mutation: MutationGenome): number {
		return mutation.sigma;
	}
}

class SigmaAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.SigmaAdaptive;
	adapt(mutation: MutationGenome, rng: () => number): number {
		return mutation.sigma * (0.9 + 0.2 * rng());
	}
}

class SelfAdaptiveAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.SelfAdaptive;
	adapt(mutation: MutationGenome, rng: () => number): number {
		const tau = 1 / Math.sqrt(2 * Math.max(1, mutation.sigma));
		return mutation.selfSigma * Math.exp(tau * sampleGaussian(rng, 1));
	}
}

class CmaSigmaAdapter implements SigmaAdapter {
	readonly type: MutationAdaptation = MutationAdaptation.Cma;
	adapt(mutation: MutationGenome): number {
		return mutation.sigma;
	}
}

const SIGMA_ADAPTERS: Record<MutationAdaptation, SigmaAdapter> = {
	[MutationAdaptation.Fixed]: new FixedSigmaAdapter(),
	[MutationAdaptation.SigmaAdaptive]: new SigmaAdaptiveAdapter(),
	[MutationAdaptation.SelfAdaptive]: new SelfAdaptiveAdapter(),
	[MutationAdaptation.Cma]: new CmaSigmaAdapter(),
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

function _mutateNeuronCount(
	layer: LayerGenome,
	sigma: number,
	mutation: MutationGenome,
	rng: () => number
): number {
	if (rng() < mutation.rate) {
		const delta = Math.round(sampleNoise(mutation.distribution, sigma * 10, rng));
		return Math.max(1, layer.neurons + delta);
	}
	return layer.neurons;
}

function _mutateActivation(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): ActivationType {
	if (mutation.mutateActivations && rng() < mutation.activationMutationRate) {
		return pick(ACTIVATIONS, rng);
	}
	return layer.activation;
}

function _mutateConnectionType(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): ConnectionType {
	return rng() < mutation.rate * 0.3 ? pick(CONNECTION_TYPES, rng) : layer.connectionType;
}

function _mutateBiasType(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): InitialisationType {
	return rng() < mutation.rate * 0.2 ? pick(BIAS_TYPES, rng) : layer.biasType;
}

/** Mutate a single hidden layer's neuron count, activation, connection type, and bias initialisation. */
export function mutateLayer(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): LayerGenome {
	const sigma = adaptSigma(mutation, rng);
	return {
		...layer,
		neurons: _mutateNeuronCount(layer, sigma, mutation, rng),
		activation: _mutateActivation(layer, mutation, rng),
		connectionType: _mutateConnectionType(layer, mutation, rng),
		biasType: _mutateBiasType(layer, mutation, rng),
	};
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

function _makePerturbFn(
	mutation: MutationGenome,
	rng: () => number
): (value: number, scale: number) => number {
	return (value: number, scale: number) => value + sampleNoise(mutation.distribution, scale, rng);
}

function _mutateDiscretePolicy(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "discretePolicy"> {
	const perturb = _makePerturbFn(mutation, rng);
	return {
		discretePolicy: {
			...rl.discretePolicy,
			epsilonStart: clamp(perturb(rl.discretePolicy.epsilonStart, 0.05), 0.1, 1.0),
			epsilonMin: clamp(perturb(rl.discretePolicy.epsilonMin, 0.01), 0.001, 0.2),
			epsilonDecay: clamp(perturb(rl.discretePolicy.epsilonDecay, 0.002), 0.9, 0.9999),
			temperature: Math.max(0.01, perturb(rl.discretePolicy.temperature, 0.1)),
		},
	};
}

function _mutateContinuousPolicy(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "continuousPolicy"> {
	const perturb = _makePerturbFn(mutation, rng);
	return {
		continuousPolicy: {
			...rl.continuousPolicy,
			noiseStd: Math.max(0.001, perturb(rl.continuousPolicy.noiseStd, 0.02)),
			noiseDecay: clamp(perturb(rl.continuousPolicy.noiseDecay, 0.001), 0.9, 0.9999),
		},
	};
}

function _mutateReplayBufferSize(bufferSize: number, rng: () => number): number {
	return Math.max(500, Math.round(bufferSize * (0.8 + rng() * 0.4)));
}

function _mutateReplayBuffer(
	rl: RLGenome,
	mutation: MutationGenome,
	rng: () => number
): Pick<RLGenome, "replayBuffer"> {
	const perturb = _makePerturbFn(mutation, rng);
	return {
		replayBuffer: {
			...rl.replayBuffer,
			bufferSize: _mutateReplayBufferSize(rl.replayBuffer.bufferSize, rng),
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

function _mutateLayers(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): LayerGenome[] {
	const perLayerMode = mutationConfig.scope === MutationScope.PerLayer;
	return layers.map((layer) =>
		perLayerMode || rng() < mutationConfig.rate
			? mutateLayer(layer, mutationConfig, rng)
			: { ...layer }
	);
}

function _maybeAddNeuron(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 0 && rng() < mutationConfig.addNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = { ...layers[li], neurons: layers[li].neurons + 1 };
	}
}

function _maybeRemoveNeuron(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 0 && rng() < mutationConfig.removeNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = { ...layers[li], neurons: Math.max(1, layers[li].neurons - 1) };
	}
}

function _createRandomLayer(rng: () => number): LayerGenome {
	return {
		neurons: 16 + Math.floor(rng() * 32),
		activation: pick(ACTIVATIONS, rng),
		connectionType: "dense-skip",
		biasType: "zeros",
	};
}

function _maybeAddLayer(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (rng() < mutationConfig.addLayerRate) {
		layers.splice(Math.floor(rng() * (layers.length + 1)), 0, _createRandomLayer(rng));
	}
}

function _maybeRemoveLayer(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 1 && rng() < mutationConfig.removeLayerRate) {
		layers.splice(Math.floor(rng() * layers.length), 1);
	}
}

function _maybeMutateNormalization(
	genome: LamarckGenome,
	mutationConfig: MutationGenome,
	rng: () => number
): NormalisationType {
	return rng() < mutationConfig.rate * 0.2
		? pick(NORM_TYPES, rng)
		: genome.network.normalization;
}

function _mutateNetworkStructure(
	ctx: MutateNetworkContext
): NetworkGenome {
	const { genome, mutationConfig, rng } = ctx;
	const layers = _mutateLayers(genome.network.hiddenLayers, mutationConfig, rng);

	_maybeAddNeuron(layers, mutationConfig, rng);
	_maybeRemoveNeuron(layers, mutationConfig, rng);
	_maybeAddLayer(layers, mutationConfig, rng);
	_maybeRemoveLayer(layers, mutationConfig, rng);

	return {
		...genome.network,
		hiddenLayers: layers,
		normalization: _maybeMutateNormalization(genome, mutationConfig, rng),
	};
}

function _mutateSigma(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): number {
	return Math.max(1e-5, mutationConfig.sigma + sampleNoise(mutationConfig.distribution, sigma * 0.1, rng));
}

function _mutateSelfSigma(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): number {
	return Math.max(1e-5, mutationConfig.selfSigma + sampleNoise(MutationDistribution.Gaussian, sigma * 0.05, rng));
}

function _mutateSelfAdaptiveParams(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): MutationGenome {
	return {
		...mutationConfig,
		sigma: _mutateSigma(mutationConfig, sigma, rng),
		selfSigma: _mutateSelfSigma(mutationConfig, sigma, rng),
		rate: clamp(mutationConfig.rate + sampleGaussian(rng, 0.01), 0.001, 0.5),
	};
}
