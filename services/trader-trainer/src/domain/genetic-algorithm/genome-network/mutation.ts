import {
	ACTION_SET_IDS,
	ACTION_SETS,
} from "@trading-model/model-runtime/agent/action-mapper";
import { mutateInputMask } from "@trading-model/model-runtime/agent/input-mask";
import { sampleGaussian } from "@trading-model/model-runtime/noise";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import type { LamarckGenome } from "../genome-fitness";
import type { MutationGenome } from "../genome-mutation";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	type LayerGenome,
	type NetworkGenome,
	NormalisationType,
} from "./types";

const NORM_TYPES: NormalisationType[] = [
	NormalisationType.None,
	NormalisationType.LogarithmicNormalization,
	NormalisationType.DecimalScaling,
	NormalisationType.MinMax,
	NormalisationType.RobustScaling,
	NormalisationType.ZScore,
];

const ACTIVATIONS: ActivationType[] = [
	ActivationType.Relu,
	ActivationType.Sigmoid,
	ActivationType.Tanh,
	ActivationType.LeakyReLu,
	ActivationType.Elu,
	ActivationType.Mish,
	ActivationType.Gelu,
];

const CONNECTION_TYPES: ConnectionType[] = [
	ConnectionType.DenseSkip,
	ConnectionType.FullyConnected,
	ConnectionType.ResidualConnection,
];

const BIAS_TYPES: InitialisationType[] = [
	InitialisationType.Zeros,
	InitialisationType.Random,
	InitialisationType.Xavier,
	InitialisationType.He,
	InitialisationType.LeCun,
];

function pick<TValue>(arr: TValue[], rng: () => number): TValue {
	return arr[Math.floor(rng() * arr.length)];
}

function _mutateNeuronCount(
	layer: LayerGenome,
	sigma: number,
	mutation: MutationGenome,
	rng: () => number
): number {
	if (rng() < mutation.rates.rate) {
		const delta = Math.round(sampleGaussian(rng, sigma * 10));
		return Math.max(1, layer.neurons + delta);
	}
	return layer.neurons;
}

function _mutateConnectionType(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): ConnectionType {
	return rng() < mutation.rates.rate * 0.3
		? pick(CONNECTION_TYPES, rng)
		: layer.connectionType;
}

function _mutateBiasType(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): InitialisationType {
	return rng() < mutation.rates.rate * 0.2
		? pick(BIAS_TYPES, rng)
		: layer.biasType;
}

export function mutateLayer(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): LayerGenome {
	const sigma = mutation.rates.sigma;
	return {
		...layer,
		neurons: _mutateNeuronCount(layer, sigma, mutation, rng) as PositiveInt,
		connectionType: _mutateConnectionType(layer, mutation, rng),
		biasType: _mutateBiasType(layer, mutation, rng),
	};
}

function _mutateLayers(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): LayerGenome[] {
	return layers.map((layer) =>
		rng() < mutationConfig.rates.rate
			? mutateLayer(layer, mutationConfig, rng)
			: { ...layer }
	);
}

function _maybeResizeLayer(
	layers: LayerGenome[],
	rate: number,
	delta: 1 | -1,
	rng: () => number
): void {
	if (layers.length > 0 && rng() < rate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = {
			...layers[li],
			neurons: Math.max(1, layers[li].neurons + delta) as PositiveInt,
		};
	}
}

function _createRandomLayer(rng: () => number): LayerGenome {
	return {
		neurons: (16 + Math.floor(rng() * 32)) as PositiveInt,
		activation: pick(ACTIVATIONS, rng),
		connectionType: ConnectionType.DenseSkip,
		biasType: InitialisationType.Zeros,
	};
}

function _maybeAddLayer(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (rng() < mutationConfig.structural.addLayerRate) {
		layers.splice(
			Math.floor(rng() * (layers.length + 1)),
			0,
			_createRandomLayer(rng)
		);
	}
}

function _maybeRemoveLayer(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 1 && rng() < mutationConfig.structural.removeLayerRate) {
		layers.splice(Math.floor(rng() * layers.length), 1);
	}
}

/** Rare discrete genes (normalisation, action set) mutate at a fifth of the base rate. */
const DISCRETE_GENE_RATE_FACTOR = 0.2;

function _maybeMutateNormalization(
	genome: LamarckGenome,
	mutationConfig: MutationGenome,
	rng: () => number
): NormalisationType {
	return rng() < mutationConfig.rates.rate * DISCRETE_GENE_RATE_FACTOR
		? pick(NORM_TYPES, rng)
		: genome.network.normalization;
}

interface MutateNetworkContext {
	genome: LamarckGenome;
	mutationConfig: MutationGenome;
	rng: () => number;
}

export function mutateNetworkStructure(
	ctx: MutateNetworkContext
): NetworkGenome {
	const { genome, mutationConfig, rng } = ctx;
	const layers = _mutateLayers(
		genome.network.hiddenLayers,
		mutationConfig,
		rng
	);

	_maybeResizeLayer(layers, mutationConfig.structural.addNeuronRate, 1, rng);
	_maybeResizeLayer(
		layers,
		mutationConfig.structural.removeNeuronRate,
		-1,
		rng
	);
	_maybeAddLayer(layers, mutationConfig, rng);
	_maybeRemoveLayer(layers, mutationConfig, rng);

	const actionSet =
		genome.gaControl.actionSetGene &&
		rng() < mutationConfig.rates.rate * DISCRETE_GENE_RATE_FACTOR
			? pick(ACTION_SET_IDS, rng)
			: genome.network.actionSet;

	return {
		...genome.network,
		...(actionSet && {
			actionSet,
			outputDim: ACTION_SETS[actionSet].length as PositiveInt,
		}),
		hiddenLayers: layers,
		normalization: _maybeMutateNormalization(genome, mutationConfig, rng),
		...(genome.network.inputMask && {
			inputMask: mutateInputMask(genome.network.inputMask, rng),
		}),
	};
}
