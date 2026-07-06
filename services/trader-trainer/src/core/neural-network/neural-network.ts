import { logger } from "@trading-model/common/config/logger";
import { NumericRange } from "@trading-model/common/domain/numeric-range";
import { agentError } from "@trading-model/common/utils/errors";
import { BackpropEngine } from "./backprop-engine";
import { FeedForwardEngine } from "./feed-forward-engine";
import { INITIALIZERS } from "./initializers";
import {
	distributeAroundWeights as distributeAroundWeightsFn,
	getWeights as getWeightsFn,
	parameterCount as parameterCountFn,
	setWeights as setWeightsFn,
} from "./network-serialization";
import {
	DEFAULT_HYPERPARAMS,
	OPTIMIZERS,
	type OptimizerHyperparams,
} from "./optimizer";
import { LearningPool } from "./pool-manager";
import { PooledTrainer } from "./pooled-trainer";
import type { ForwardContext, LayerMemory, NeuralNetworkConfig } from "./type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "./type";

function _resolveActivationType(
	cfg: NeuralNetworkConfig
): Required<NeuralNetworkConfig>["activationType"] {
	return (
		cfg.activationType ??
		new Array(cfg.neuronsByLayer.length - 1).fill(ActivationType.Relu)
	);
}

function _resolveBiasInit(
	cfg: NeuralNetworkConfig
): Required<NeuralNetworkConfig>["biasInitialisationType"] {
	return (
		cfg.biasInitialisationType ??
		cfg.initialisationType ??
		InitialisationType.Random
	);
}

function mergeConfig(cfg: NeuralNetworkConfig): Required<NeuralNetworkConfig> {
	return {
		useBias: cfg.useBias ?? true,
		deltaHuber: cfg.deltaHuber ?? 1,
		enablePool: cfg.enablePool ?? true,
		neuronsByLayer: cfg.neuronsByLayer,
		poolMaxSize: cfg.poolMaxSize ?? 10_000,
		learningRate: cfg.learningRate ?? 0.001,
		optimizerType: cfg.optimizerType ?? OptimizerType.Sgd,
		gradientClipNorm: cfg.gradientClipNorm ?? 5.0,
		biasMutationScale: cfg.biasMutationScale ?? 0.05,
		normalisationType: cfg.normalisationType ?? NormalisationType.None,
		weightMutationScale: cfg.weightMutationScale ?? 0.1,
		optimizerHyperparams: cfg.optimizerHyperparams ?? {},
		initialisationType: cfg.initialisationType ?? InitialisationType.Random,
		connectionType: cfg.connectionType ?? ConnectionType.FullyConnected,
		lossFunctionType: cfg.lossFunctionType ?? LossFunctionType.MeanSquaredError,
		normalizedInputRange:
			cfg.normalizedInputRange ??
			new NumericRange(0, cfg.neuronsByLayer[0] - 1),
		biasInitialisationType: _resolveBiasInit(cfg),
		activationType: _resolveActivationType(cfg),
	};
}

function _initializeWeights(
	fanIn: number,
	fanOut: number,
	config: Required<NeuralNetworkConfig>
): Float32Array {
	const weights = new Float32Array(fanIn * fanOut);
	for (let i = 0; i < weights.length; i++) {
		weights[i] = INITIALIZERS[config.initialisationType].initialize(
			fanIn,
			fanOut
		);
	}
	return weights;
}

function _initializeBiases(
	fanIn: number,
	fanOut: number,
	config: Required<NeuralNetworkConfig>
): Float32Array {
	const bias = new Float32Array(fanOut);
	for (let i = 0; i < bias.length; i++) {
		bias[i] = INITIALIZERS[config.biasInitialisationType].initialize(
			fanIn,
			fanOut
		);
	}
	return bias;
}

function _initLayerParams(
	fanIn: number,
	fanOut: number,
	config: Required<NeuralNetworkConfig>
): { weights: Float32Array; bias: Float32Array } {
	return {
		weights: _initializeWeights(fanIn, fanOut, config),
		bias: _initializeBiases(fanIn, fanOut, config),
	};
}

function _buildLayerMemory(
	fanIn: number,
	fanOut: number,
	config: Required<NeuralNetworkConfig>,
	opt: import("./optimizer").Optimizer
): LayerMemory {
	return {
		fanIn,
		fanOut,
		weights: _initializeWeights(fanIn, fanOut, config),
		bias: _initializeBiases(fanIn, fanOut, config),
		output: new Float32Array(fanOut),
		preActivation: new Float32Array(fanOut),
		delta: new Float32Array(fanOut),
		gradW: new Float32Array(fanIn * fanOut),
		gradB: new Float32Array(fanOut),
		accumGradW: new Float32Array(fanIn * fanOut),
		accumGradB: new Float32Array(fanOut),
		wState: opt.initState(fanIn * fanOut),
		bState: opt.initState(fanOut),
	};
}

function _validateLayerSize(sizes: number[], i: number): void {
	if (sizes[i] <= 0 || sizes[i + 1] <= 0) {
		throw agentError("Layer sizes must be positive integers");
	}
}

function createLayerMemories(
	config: Required<NeuralNetworkConfig>,
	_optimizerHp: OptimizerHyperparams
): LayerMemory[] {
	const sizes = config.neuronsByLayer;
	const layers: LayerMemory[] = [];
	const opt = OPTIMIZERS[config.optimizerType];

	for (let i = 0; i < sizes.length - 1; i++) {
		_validateLayerSize(sizes, i);
		layers.push(_buildLayerMemory(sizes[i], sizes[i + 1], config, opt));
	}

	return layers;
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

function validateActivationLoss(
	config: Required<NeuralNetworkConfig>,
	layerCount: number
): void {
	_warnSigmoidLoss(config);
	_validateSoftmaxLoss(config);
	_validateActivationCount(config, layerCount);
}

function _resolveOptimizerHyperparams(
	config: Required<NeuralNetworkConfig>
): OptimizerHyperparams {
	return { ...DEFAULT_HYPERPARAMS, ...config.optimizerHyperparams };
}

function _validateMinLayers(config: Required<NeuralNetworkConfig>): void {
	if (config.neuronsByLayer.length < 2) {
		throw agentError(
			"Neural network must have at least 2 layers (input + output)"
		);
	}
}

export class NeuralNetwork {
	private readonly _config: Required<NeuralNetworkConfig>;
	private readonly _optimizerHp: OptimizerHyperparams;
	private readonly _layers: LayerMemory[] = [];
	private readonly _poolManager: LearningPool = new LearningPool();
	private readonly _feedForward: FeedForwardEngine;
	private readonly _backprop: BackpropEngine;
	private readonly _trainer: PooledTrainer;

	constructor(cfg: NeuralNetworkConfig) {
		this._config = mergeConfig(cfg);
		this._optimizerHp = _resolveOptimizerHyperparams(this._config);
		_validateMinLayers(this._config);
		this._layers.push(...createLayerMemories(this._config, this._optimizerHp));
		validateActivationLoss(this._config, this._layers.length);
		this._feedForward = new FeedForwardEngine(this._config, this._layers);
		this._backprop = new BackpropEngine(
			this._config,
			this._layers,
			this._optimizerHp
		);
		this._trainer = new PooledTrainer(
			this._feedForward,
			this._backprop,
			this._poolManager,
			this._config
		);
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
	}

	public predict(input: Float32Array): Float32Array {
		return this._feedForward.predict(input);
	}

	public train(inputs: Float32Array, targets: Float32Array): number {
		return this._trainer.train(inputs, targets);
	}

	public forwardAndPool(input: Float32Array, target: Float32Array): number {
		return this._trainer.forwardAndPool(input, target);
	}

	public trainPooled(): number {
		return this._trainer.trainPooled();
	}

	public getPoolSize(): number {
		return this._poolManager.getSize();
	}

	public clearPool(): void {
		this._poolManager.clear();
	}

	private _normalize(
		input: Float32Array,
		params?: import("./normalize").NormalizeParams
	): Float32Array {
		return (this._feedForward as any)._normalize(input, params);
	}

	public getWeights(): Float32Array {
		return getWeightsFn(this._layers);
	}

	public setWeights(buffer: Float32Array): void {
		setWeightsFn(this._layers, buffer);
	}

	public distributeAroundWeights(
		reference: NeuralNetwork | number,
		sigma = 0.1
	): void {
		const ref =
			typeof reference === "number" ? reference : reference.getWeights();
		distributeAroundWeightsFn(this._layers, ref, sigma);
	}

	public parameterCount(): number {
		return parameterCountFn(this._layers);
	}
}
