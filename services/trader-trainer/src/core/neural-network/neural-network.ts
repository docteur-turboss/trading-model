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

function initLayerParams(
	fanIn: number,
	fanOut: number,
	config: Required<NeuralNetworkConfig>
): { weights: Float32Array; bias: Float32Array } {
	const bias = new Float32Array(fanOut);
	const weights = new Float32Array(fanIn * fanOut);

	for (let i = 0; i < weights.length; i++) {
		weights[i] = INITIALIZERS[config.initialisationType].initialize(
			fanIn,
			fanOut
		);
	}
	for (let i = 0; i < bias.length; i++) {
		bias[i] = INITIALIZERS[config.biasInitialisationType].initialize(
			fanIn,
			fanOut
		);
	}

	return { bias, weights };
}

function createLayerMemories(
	config: Required<NeuralNetworkConfig>,
	_optimizerHp: OptimizerHyperparams
): LayerMemory[] {
	const sizes = config.neuronsByLayer;
	const layers: LayerMemory[] = [];

	for (let i = 0; i < sizes.length - 1; i++) {
		if (sizes[i] <= 0 || sizes[i + 1] <= 0) {
			throw new AgentError(
				"Layer sizes must be positive integers",
			);
		}

		const fanIn = sizes[i];
		const fanOut = sizes[i + 1];
		const { bias, weights } = initLayerParams(fanIn, fanOut, config);
		const opt = OPTIMIZERS[config.optimizerType];

		layers.push({
			fanIn,
			fanOut,
			weights,
			bias,
			output: new Float32Array(fanOut),
			preActivation: new Float32Array(fanOut),
			delta: new Float32Array(fanOut),
			gradW: new Float32Array(fanIn * fanOut),
			gradB: new Float32Array(fanOut),
			accumGradW: new Float32Array(fanIn * fanOut),
			accumGradB: new Float32Array(fanOut),
			wState: opt.initState(fanIn * fanOut),
			bState: opt.initState(fanOut),
		});
	}

	return layers;
}

function validateActivationLoss(
	config: Required<NeuralNetworkConfig>,
	layerCount: number
): void {
	const lastActivation =
		config.activationType[config.activationType.length - 1];

	if (
		lastActivation === "sigmoid" &&
		config.lossFunctionType !== "binary-cross-entropy"
	) {
		logger.warn("Sigmoid output is usually paired with binary-cross-entropy");
	}
	if (
		lastActivation === "softmax" &&
		config.lossFunctionType !== "cross-entropy" &&
		config.lossFunctionType !== "binary-cross-entropy"
	) {
		throw new AgentError(
			`Softmax activation requires "cross-entropy" or "binary-cross-entropy" loss`,
		);
	}
	if (config.activationType.length !== layerCount) {
		throw new AgentError(
			`ActivationType must be the same length of the layers. Expected : ${layerCount}, got ${config.activationType.length}`,
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

	constructor(cfg: NeuralNetworkConfig) {
		this._config = mergeConfig(cfg);

		this._optimizerHp = {
			...DEFAULT_HYPERPARAMS,
			...this._config.optimizerHyperparams,
		};

		const sizes = this._config.neuronsByLayer;

		if (sizes.length < 2) {
			throw new AgentError(
				"Neural network must have at least 2 layers (input + output)",
			);
		}

		this._layers.push(...createLayerMemories(this._config, this._optimizerHp));
		validateActivationLoss(this._config, this._layers.length);

		this._feedForward = new FeedForwardEngine(this._config, this._layers);
		this._backprop = new BackpropEngine(
			this._config,
			this._layers,
			this._optimizerHp
		);
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
	}

	public predict(input: Float32Array): Float32Array {
		return this._feedForward.predict(input);
	}

	public train(inputs: Float32Array, targets: Float32Array): number {
		const expectedInput = this._config.neuronsByLayer[0];
		const expectedOutput =
			this._config.neuronsByLayer[this._config.neuronsByLayer.length - 1];

		if (inputs.length !== expectedInput) {
			throw new AgentError(
				`Expected input size ${expectedInput}, got ${inputs.length}`,
			);
		}

		if (targets.length !== expectedOutput) {
			throw new AgentError(
				`Expected target size ${expectedOutput}, got ${targets.length}`,
			);
		}

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
			throw new AgentError(
				"Learning pool is disabled. Set enablePool: true in config.",
			);
		}

		const pool = this._poolManager.getAll();
		if (pool.length === 0) {
			return 0;
		}

		const poolSize = pool.length;

		this._backprop.resetAccumulators();

		let totalLoss = 0;

		for (const experience of pool) {
			totalLoss += experience.loss;
			const context = this._poolManager.experienceToContext(experience);
			this._backprop.backpropAccumulate(context, experience.target!);
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
