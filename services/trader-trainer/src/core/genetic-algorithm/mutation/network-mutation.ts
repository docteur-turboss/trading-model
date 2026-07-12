import type { PositiveInt } from "@trading-model/common/domain/primitives";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../../neural-network/type";
import type {
	LamarckGenome,
	LayerGenome,
	MutationGenome,
} from "../genome-types";
import { MutationScope } from "../genome-types";
import { sampleNoise } from "../noise";
import { adaptSigma } from "./sigma-adapters";

const NORM_TYPES: NormalisationType[] = [
	NormalisationType.None,
	NormalisationType.LogarithmicNormalization,
	NormalisationType.DecimalScaling,
	NormalisationType.Border,
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
	ActivationType.Softmax,
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
		const delta = Math.round(
			sampleNoise(mutation.distribution, sigma * 10, rng)
		);
		return Math.max(1, layer.neurons + delta);
	}
	return layer.neurons;
}

function _mutateActivation(
	layer: LayerGenome,
	mutation: MutationGenome,
	rng: () => number
): ActivationType {
	if (
		mutation.mutateActivations &&
		rng() < mutation.rates.activationMutationRate
	) {
		return pick(ACTIVATIONS, rng);
	}
	return layer.activation;
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
	const sigma = adaptSigma(mutation, rng);
	return {
		...layer,
		neurons: _mutateNeuronCount(layer, sigma, mutation, rng) as PositiveInt,
		activation: _mutateActivation(layer, mutation, rng),
		connectionType: _mutateConnectionType(layer, mutation, rng),
		biasType: _mutateBiasType(layer, mutation, rng),
	};
}

function _mutateLayers(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): LayerGenome[] {
	const perLayerMode = mutationConfig.scope === MutationScope.PerLayer;
	return layers.map((layer) =>
		perLayerMode || rng() < mutationConfig.rates.rate
			? mutateLayer(layer, mutationConfig, rng)
			: { ...layer }
	);
}

function _maybeAddNeuron(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 0 && rng() < mutationConfig.structural.addNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = {
			...layers[li],
			neurons: (layers[li].neurons + 1) as PositiveInt,
		};
	}
}

function _maybeRemoveNeuron(
	layers: LayerGenome[],
	mutationConfig: MutationGenome,
	rng: () => number
): void {
	if (layers.length > 0 && rng() < mutationConfig.structural.removeNeuronRate) {
		const li = Math.floor(rng() * layers.length);
		layers[li] = {
			...layers[li],
			neurons: Math.max(1, layers[li].neurons - 1) as PositiveInt,
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

function _maybeMutateNormalization(
	genome: LamarckGenome,
	mutationConfig: MutationGenome,
	rng: () => number
): NormalisationType {
	return rng() < mutationConfig.rates.rate * 0.2
		? pick(NORM_TYPES, rng)
		: genome.network.normalization;
}

export interface MutateNetworkContext {
	genome: LamarckGenome;
	mutationConfig: MutationGenome;
	sigma: number;
	rng: () => number;
}

export function mutateNetworkStructure(
	ctx: MutateNetworkContext
): import("../genome-types").NetworkGenome {
	const { genome, mutationConfig, rng } = ctx;
	const layers = _mutateLayers(
		genome.network.hiddenLayers,
		mutationConfig,
		rng
	);

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
