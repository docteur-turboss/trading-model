import type { PositiveInt } from "@trading-model/primitives/primitives";
import { agentError } from "../../shared/errors";
import { INITIALIZERS } from "./initializers";
import type { LayerDims } from "./layer-dims";
import type { LayerMemory, NeuralNetworkConfig } from "./type";

function _initArray(
	length: number,
	type: Required<NeuralNetworkConfig>["initialisationType"],
	dims: LayerDims,
	rng: Required<NeuralNetworkConfig>["rng"]
): Float32Array {
	const values = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		values[i] = INITIALIZERS[type].initialize(dims, rng);
	}
	return values;
}

function _buildLayerMemory(
	dims: LayerDims,
	config: Required<NeuralNetworkConfig>
): LayerMemory {
	return {
		fanIn: dims.fanIn as unknown as PositiveInt,
		fanOut: dims.fanOut as unknown as PositiveInt,
		weights: _initArray(
			dims.fanIn * dims.fanOut,
			config.initialisationType,
			dims,
			config.rng
		),
		bias: _initArray(
			dims.fanOut,
			config.biasInitialisationType,
			dims,
			config.rng
		),
		output: new Float32Array(dims.fanOut),
		preActivation: new Float32Array(dims.fanOut),
		delta: new Float32Array(dims.fanOut),
		gradW: new Float32Array(dims.fanIn * dims.fanOut),
		gradB: new Float32Array(dims.fanOut),
	};
}

function _validateLayerSize(sizes: number[], layerIdx: number): void {
	if (sizes[layerIdx] <= 0 || sizes[layerIdx + 1] <= 0) {
		throw agentError("Layer sizes must be positive integers");
	}
}

function _validateActivationCount(
	config: Required<NeuralNetworkConfig>,
	layerCount: number
): void {
	if (config.activationType.length !== layerCount) {
		throw agentError(
			`ActivationType must be the same length of the layers. Expected : ${layerCount}, got ${config.activationType.length}`
		);
	}
}

export function validateActivationLoss(
	config: Required<NeuralNetworkConfig>,
	layerCount: number
): void {
	_validateActivationCount(config, layerCount);
}

export function validateMinLayers(config: Required<NeuralNetworkConfig>): void {
	if (config.neuronsByLayer.length < 2) {
		throw agentError(
			"Neural network must have at least 2 layers (input + output)"
		);
	}
}

export function createLayerMemories(
	config: Required<NeuralNetworkConfig>
): LayerMemory[] {
	const sizes = config.neuronsByLayer;
	const layers: LayerMemory[] = [];

	for (let i = 0; i < sizes.length - 1; i++) {
		_validateLayerSize(sizes, i);
		layers.push(
			_buildLayerMemory({ fanIn: sizes[i], fanOut: sizes[i + 1] }, config)
		);
	}

	return layers;
}
