import { agentError } from "@trading-model/model-runtime/errors";
import {
	type LayerMemory,
	mergeConfig,
	type NeuralNetworkConfig,
} from "@trading-model/model-runtime/neural-network/type";
import { PositiveInt } from "@trading-model/primitives/primitives";
import { INITIALIZERS } from "./initializers";
import type { LayerDims } from "./layer-dims";
import type { NnTrainingDeps } from "./nn-training-deps";

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
		fanIn: PositiveInt.of(dims.fanIn),
		fanOut: PositiveInt.of(dims.fanOut),
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
		gradW: new Float32Array(dims.fanIn * dims.fanOut),
		gradB: new Float32Array(dims.fanOut),
	};
}

function _createLayerMemories(
	config: Required<NeuralNetworkConfig>
): LayerMemory[] {
	const sizes = config.neuronsByLayer;
	const layers: LayerMemory[] = [];

	for (let i = 0; i < sizes.length - 1; i++) {
		if (sizes[i] <= 0 || sizes[i + 1] <= 0) {
			throw agentError("Layer sizes must be positive integers");
		}
		layers.push(
			_buildLayerMemory({ fanIn: sizes[i], fanOut: sizes[i + 1] }, config)
		);
	}

	return layers;
}

export const NeuralNetworkBuilder = {
	build(cfg: NeuralNetworkConfig): NnTrainingDeps {
		const config = mergeConfig(cfg);
		if (config.neuronsByLayer.length < 2) {
			throw agentError(
				"Neural network must have at least 2 layers (input + output)"
			);
		}
		const layers = _createLayerMemories(config);
		if (config.activationType.length !== layers.length) {
			throw agentError(
				`ActivationType must be the same length of the layers. Expected : ${layers.length}, got ${config.activationType.length}`
			);
		}
		return { config, layers };
	},
};
