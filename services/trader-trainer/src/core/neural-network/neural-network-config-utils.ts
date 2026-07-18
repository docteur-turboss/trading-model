import { logger } from "@trading-model/common/config/logger";
import { agentError } from "@trading-model/common/utils/errors";
import { INITIALIZERS } from "./initializers";
import type { LayerDims } from "./layer-dims";
import {
	DEFAULT_HYPERPARAMS,
	OPTIMIZERS,
	type OptimizerHyperparams,
} from "./optimizer";
import type { LayerMemory, LayerWeights, NeuralNetworkConfig } from "./type";
import { ActivationType, LossFunctionType } from "./type";

export { mergeConfig } from "./type";

function _initializeWeights(
	dims: LayerDims,
	config: Required<NeuralNetworkConfig>
): Float32Array {
	const weights = new Float32Array(dims.fanIn * dims.fanOut);
	for (let i = 0; i < weights.length; i++) {
		weights[i] = INITIALIZERS[config.initialisationType].initialize(dims);
	}
	return weights;
}

function _initializeBiases(
	dims: LayerDims,
	config: Required<NeuralNetworkConfig>
): Float32Array {
	const bias = new Float32Array(dims.fanOut);
	for (let i = 0; i < bias.length; i++) {
		bias[i] = INITIALIZERS[config.biasInitialisationType].initialize(dims);
	}
	return bias;
}

function _initLayerParams(
	dims: LayerDims,
	config: Required<NeuralNetworkConfig>
): LayerWeights {
	return {
		weights: _initializeWeights(dims, config),
		bias: _initializeBiases(dims, config),
	};
}

function _buildLayerMemory(
	dims: LayerDims,
	config: Required<NeuralNetworkConfig>,
	opt: import("./optimizer").Optimizer
): LayerMemory {
	return {
		fanIn: dims.fanIn,
		fanOut: dims.fanOut,
		weights: _initializeWeights(dims, config),
		bias: _initializeBiases(dims, config),
		output: new Float32Array(dims.fanOut),
		preActivation: new Float32Array(dims.fanOut),
		delta: new Float32Array(dims.fanOut),
		gradW: new Float32Array(dims.fanIn * dims.fanOut),
		gradB: new Float32Array(dims.fanOut),
		accumGradW: new Float32Array(dims.fanIn * dims.fanOut),
		accumGradB: new Float32Array(dims.fanOut),
		wState: opt.initState(dims.fanIn * dims.fanOut),
		bState: opt.initState(dims.fanOut),
	};
}

function _validateLayerSize(sizes: number[], layerIdx: number): void {
	if (sizes[layerIdx] <= 0 || sizes[layerIdx + 1] <= 0) {
		throw agentError("Layer sizes must be positive integers");
	}
}

function _warnSigmoidLoss(config: Required<NeuralNetworkConfig>): void {
	if (
		config.activationType[config.activationType.length - 1] ===
			ActivationType.Sigmoid &&
		config.lossFunctionType !== LossFunctionType.BinaryCrossEntropy
	) {
		logger.warn("Sigmoid output is usually paired with binary-cross-entropy");
	}
}

function _validateSoftmaxLoss(config: Required<NeuralNetworkConfig>): void {
	if (
		config.activationType[config.activationType.length - 1] ===
			ActivationType.Softmax &&
		config.lossFunctionType !== LossFunctionType.CrossEntropy &&
		config.lossFunctionType !== LossFunctionType.BinaryCrossEntropy
	) {
		throw agentError(
			`Softmax activation requires "cross-entropy" or "binary-cross-entropy" loss`
		);
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
	_warnSigmoidLoss(config);
	_validateSoftmaxLoss(config);
	_validateActivationCount(config, layerCount);
}

export function resolveOptimizerHyperparams(
	config: Required<NeuralNetworkConfig>
): OptimizerHyperparams {
	return { ...DEFAULT_HYPERPARAMS, ...config.optimizerHyperparams };
}

export function validateMinLayers(config: Required<NeuralNetworkConfig>): void {
	if (config.neuronsByLayer.length < 2) {
		throw agentError(
			"Neural network must have at least 2 layers (input + output)"
		);
	}
}

export function createLayerMemories(
	config: Required<NeuralNetworkConfig>,
	_optimizerHp: OptimizerHyperparams
): LayerMemory[] {
	const sizes = config.neuronsByLayer;
	const layers: LayerMemory[] = [];
	const opt = OPTIMIZERS[config.optimizerType];

	for (let i = 0; i < sizes.length - 1; i++) {
		_validateLayerSize(sizes, i);
		layers.push(
			_buildLayerMemory({ fanIn: sizes[i], fanOut: sizes[i + 1] }, config, opt)
		);
	}

	return layers;
}
