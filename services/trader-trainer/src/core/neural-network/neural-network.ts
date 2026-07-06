import { logger } from "@trading-model/common/config/logger";
import { AppError, AgentError } from "@trading-model/common/utils/errors";

import { BackpropEngine } from "./backprop-engine";
import { FeedForwardEngine } from "./feed-forward-engine";
import { INITIALIZERS } from "./initializers";
import { LearningPool } from "./pool-manager";
import { LOSSES } from "./losses";
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
import type {
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";

function _resolveActivationType(cfg: NeuralNetworkConfig): Required<NeuralNetworkConfig>["activationType"] {
	return cfg.activationType ?? new Array(cfg.neuronsByLayer.length - 1).fill("relu");
}

function _resolveBiasInit(cfg: NeuralNetworkConfig): Required<NeuralNetworkConfig>["biasInitialisationType"] {
	return cfg.biasInitialisationType ?? cfg.initialisationType ?? "random";
}

function mergeConfig(cfg: NeuralNetworkConfig): Required<NeuralNetworkConfig> {
	return {
		useBias: cfg.useBias ?? true,
		deltaHuber: cfg.deltaHuber ?? 1,
		enablePool: cfg.enablePool ?? true,
		neuronsByLayer: cfg.neuronsByLayer,
		poolMaxSize: cfg.poolMaxSize ?? 10_000,
		learningRate: cfg.learningRate ?? 0.001,
		optimizerType: cfg.optimizerType ?? "sgd",
		gradientClipNorm: cfg.gradientClipNorm ?? 5.0,
		biasMutationScale: cfg.biasMutationScale ?? 0.05,
		normalisationType: cfg.normalisationType ?? "none",
		weightMutationScale: cfg.weightMutationScale ?? 0.1,
		optimizerHyperparams: cfg.optimizerHyperparams ?? {},
		initialisationType: cfg.initialisationType ?? "random",
		connectionType: cfg.connectionType ?? "fully-connected",
		lossFunctionType: cfg.lossFunctionType ?? "mean-squared-error",
		normalizedInputRange: cfg.normalizedInputRange ?? [0, cfg.neuronsByLayer[0] - 1],
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
		weights[i] = INITIALIZERS[config.initialisationType].initialize(fanIn, fanOut);
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
		bias[i] = INITIALIZERS[config.biasInitialisationType].initialize(fanIn, fanOut);
	}
	return bias;
}

function initLayerParams(
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
		throw new AgentError("Layer sizes must be positive integers");
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
		config.activationType[config.activationType.length - 1] === "sigmoid" &&
		config.lossFunctionType !== "binary-cross-entropy"
	) {
		logger.warn("Sigmoid output is usually paired with binary-cross-entropy");
	}
}

function _validateSoftmaxLoss(config: Required<NeuralNetworkConfig>): void {
	if (
		config.activationType[config.activationType.length - 1] === "softmax" &&
		config.lossFunctionType !== "cross-entropy" &&
		config.lossFunctionType !== "binary-cross-entropy"
	) {
		throw new AgentError(
			`Softmax activation requires "cross-entropy" or "binary-cross-entropy" loss`,
		);
	}
}

function _validateActivationCount(config: Required<NeuralNetworkConfig>, layerCount: number): void {
	if (config.activationType.length !== layerCount) {
		throw new AgentError(
			`ActivationType must be the same length of the layers. Expected : ${layerCount}, got ${config.activationType.length}`,
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

export class NeuralNetwork {
	private readonly _config: Required<NeuralNetworkConfig>;
	private readonly _optimizerHp: OptimizerHyperparams;
	private readonly _layers: LayerMemory[] = [];
	private readonly _poolManager: LearningPool = new LearningPool();
	private readonly _feedForward: FeedForwardEngine;
	private readonly _backprop: BackpropEngine;

	constructor(cfg: NeuralNetworkConfig) {
		this._config = mergeConfig(cfg);
		this._optimizerHp = this._resolveOptimizerHp();
		this._validateMinLayers();
		this._initialiseLayers();
		this._feedForward = new FeedForwardEngine(this._config, this._layers);
		this._backprop = new BackpropEngine(this._config, this._layers, this._optimizerHp);
	}

	private _resolveOptimizerHp(): OptimizerHyperparams {
		return { ...DEFAULT_HYPERPARAMS, ...this._config.optimizerHyperparams };
	}

	private _validateMinLayers(): void {
		if (this._config.neuronsByLayer.length < 2) {
			throw new AgentError(
				"Neural network must have at least 2 layers (input + output)",
			);
		}
	}

	private _initialiseLayers(): void {
		this._layers.push(...createLayerMemories(this._config, this._optimizerHp));
		validateActivationLoss(this._config, this._layers.length);
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
	}

	public predict(input: Float32Array): Float32Array {
		return this._feedForward.predict(input);
	}

	public train(inputs: Float32Array, targets: Float32Array): number {
		this._validateDimensions(inputs, targets);
		const context = this._feedForward.forward(inputs);
		this._backprop.backprop(context, targets);
		return this._backprop.computeLoss(context.output, targets);
	}

	public forwardAndPool(input: Float32Array, target: Float32Array): number {
		if (!this._config.enablePool) {
			throw new AgentError(
				"Learning pool is disabled. Set enablePool: true in config.",
			);
		}

		this._validateDimensions(input, target);

		const context = this._feedForward.forward(input);
		const loss = this._backprop.computeLoss(context.output, target);

		const experience = this._poolManager.createExperience({ input, context, target, loss });
		this._poolManager.push(experience, this._config.poolMaxSize);

		return loss;
	}

	public trainPooled(): number {
		if (!this._config.enablePool) {
			throw new AgentError("Learning pool is disabled. Set enablePool: true in config.");
		}
		const pool = this._poolManager.getAll();
		if (pool.length === 0) {
			return 0;
		}
		return this._trainPooledBatch(pool);
	}

	private _trainPooledBatch(pool: import("./type").PoolExperience[]): number {
		const poolSize = pool.length;
		this._backprop.resetAccumulators();

		let totalLoss = 0;
		for (const exp of pool) {
			totalLoss += exp.loss;
			this._backprop.backpropAccumulate(this._poolManager.experienceToContext(exp), exp.target!);
		}

		this._backprop.applyAccumulatedGradients(poolSize);
		this._poolManager.clear();
		return totalLoss / poolSize;
	}

	public getPoolSize(): number {
		return this._poolManager.getSize();
	}

	public clearPool(): void {
		this._poolManager.clear();
	}

	private _normalize(
		input: Float32Array,
		params?: { min: number; max: number }
	): Float32Array {
		return (this._feedForward as any)._normalize(input, params);
	}

	private _validateDimensions(input: Float32Array, target: Float32Array): void {
		const expectedInput = this._config.neuronsByLayer[0];
		const expectedOutput =
			this._config.neuronsByLayer[this._config.neuronsByLayer.length - 1];

		if (input.length !== expectedInput) {
			throw new AgentError(
				`Expected input size ${expectedInput}, got ${input.length}`,
			);
		}

		if (target.length !== expectedOutput) {
			throw new AgentError(
				`Expected target size ${expectedOutput}, got ${target.length}`,
			);
		}
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
