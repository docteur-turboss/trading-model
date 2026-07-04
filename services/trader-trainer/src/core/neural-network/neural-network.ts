import { logger } from "@trading-model/common/config/logger";
import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";

import { ACTIVATIONS } from "./activation";
import { INITIALIZERS } from "./initializers";
import { LOSSES } from "./losses";
import {
	distributeAroundWeights as distributeAroundWeightsFn,
	getWeights as getWeightsFn,
	parameterCount as parameterCountFn,
	setWeights as setWeightsFn,
} from "./network-serialization";
import { NORMALIZERS } from "./normalize";
import {
	DEFAULT_HYPERPARAMS,
	OPTIMIZERS,
	type OptimizerHyperparams,
} from "./optimizer";
import type {
	ActivationType,
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
	PooledExperience,
} from "./type";

/**
 * Configurable fully-connected feedforward neural network with support for
 * multiple activation functions, loss functions, normalisations, connection
 * types, and weight initialisations.
 *
 * Architecture: `Input → [Hidden…] → Output`
 *
 * All intermediate and output layers share the same activation function.
 */
export class NeuralNetwork {
	private readonly _config: Required<NeuralNetworkConfig>;
	private readonly _optimizerHp: OptimizerHyperparams;
	private readonly _layers: LayerMemory[] = [];
	private readonly _pool: PooledExperience[] = [];

	constructor(cfg: NeuralNetworkConfig) {
		this._config = {
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
			normalizedInputRange: cfg.normalizedInputRange ?? [
				0,
				cfg.neuronsByLayer[0] - 1,
			],
			biasInitialisationType:
				cfg.biasInitialisationType ?? cfg.initialisationType ?? "random",
			activationType:
				cfg.activationType ??
				new Array(cfg.neuronsByLayer.length - 1).fill("relu"),
		};

		this._optimizerHp = {
			...DEFAULT_HYPERPARAMS,
			...this._config.optimizerHyperparams,
		};

		const sizes = this._config.neuronsByLayer;

		if (sizes.length < 2) {
			throw new AppError(
				"Neural network must have at least 2 layers (input + output)",
				ErrorCodes.AGENT_ERROR
			);
		}

		for (let i = 0; i < sizes.length - 1; i++) {
			if (sizes[i] <= 0 || sizes[i + 1] <= 0) {
				throw new AppError(
					"Layer sizes must be positive integers",
					ErrorCodes.AGENT_ERROR
				);
			}

			const fanIn = sizes[i];
			const fanOut = sizes[i + 1];

			const { bias, weights } = this._initParams(fanIn, fanOut);
			const opt = OPTIMIZERS[this._config.optimizerType];

			const layerConfigs = {
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
			};

			this._layers.push(layerConfigs);
		}

		const lastActivation =
			this._config.activationType[this._config.activationType.length - 1];

		if (
			lastActivation === "sigmoid" &&
			this._config.lossFunctionType !== "binary-cross-entropy"
		) {
			logger.warn("Sigmoid output is usually paired with binary-cross-entropy");
		}
		if (
			lastActivation === "softmax" &&
			this._config.lossFunctionType !== "cross-entropy" &&
			this._config.lossFunctionType !== "binary-cross-entropy"
		) {
			throw new AppError(
				`Softmax activation requires "cross-entropy" or "binary-cross-entropy" loss`,
				ErrorCodes.AGENT_ERROR
			);
		}
		if (this._config.activationType.length !== this._layers.length) {
			throw new AppError(
				`ActivationType must be the same length of the layers. Expected : ${this._layers.length}, got ${this._config.activationType.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}
	}

	/**
	 * Builds parameters (weights & biases) using configured initialisation strategy.
	 *
	 * **FIXED**: Now respects `biasInitialisationType` separately from weights.
	 *
	 * @param fanIn - Input dimension
	 * @param fanOut - Output dimension
	 */
	private _initParams(
		fanIn: number,
		fanOut: number
	): {
		weights: Float32Array;
		bias: Float32Array;
	} {
		const bias = new Float32Array(fanOut);
		const weights = new Float32Array(fanIn * fanOut);

		// Use weight initialiser for weights
		for (let i = 0; i < weights.length; i++) {
			weights[i] = INITIALIZERS[this._config.initialisationType].initialize(
				fanIn,
				fanOut
			);
		}

		// Use bias initialiser for biases (can be different!)
		for (let i = 0; i < bias.length; i++) {
			bias[i] = INITIALIZERS[this._config.biasInitialisationType].initialize(
				fanIn,
				fanOut
			);
		}

		return {
			bias,
			weights,
		};
	}

	/**
	 * Normalises an input vector in-place according to the configured strategy.
	 *
	 * @param input  - Raw input values.
	 * @param params - Optional explicit `min` / `max` for the `border` strategy.
	 * @returns Normalised copy of `input`.
	 */
	private _normalize(
		input: Float32Array,
		params?: { min: number; max: number }
	): Float32Array {
		const data = new Float32Array(input);
		const len = data.length;

		if (len === 0) {
			return data;
		}
		return NORMALIZERS[this._config.normalisationType].normalize(
			data,
			len,
			params
		);
	}

	/**
	 *
	 * @param delta
	 * @param maxNorm
	 * @returns
	 */
	private _clipGradients(
		delta: Float32Array,
		maxNorm: number = this._config.gradientClipNorm
	): Float32Array {
		if (maxNorm <= 0) {
			return delta;
		}
		const data = delta;

		let sum = 0;
		for (const _value of data) {
			sum += _value * _value;
		}
		const norm = Math.sqrt(sum);

		if (norm > maxNorm) {
			const scale = maxNorm / norm;
			for (let i = 0; i < data.length; i++) {
				data[i] *= scale;
			}
			return data;
		}

		return data;
	}

	/**
	 * Applies the configured activation function element-wise.
	 *
	 * @param x - Pre-activation values.
	 * @returns Post-activation values.
	 */
	private _activate(input: number, activation: ActivationType): number {
		return ACTIVATIONS[activation].fn(input);
	}

	/**
	 * Derivative of the activation function with respect to its **post**-activation
	 * value (i.e. the value stored in `activations`).
	 *
	 * @param a - Post-activation values from the last forward pass.
	 * @returns Element-wise derivatives.
	 */
	private _activationDerivative(
		postActivation: number,
		preActivation: number,
		activationType: ActivationType
	): number {
		return ACTIVATIONS[activationType].derivative(
			postActivation,
			preActivation
		);
	}

	/**
	 * Computes the scalar loss between predictions and ground-truth labels.
	 *
	 * @param output - Network predictions.
	 * @param target - Ground-truth labels.
	 * @throws {AgentError} When array lengths differ.
	 */
	private _lossFunction(output: Float32Array, target: Float32Array): number {
		return LOSSES[this._config.lossFunctionType].loss(
			output,
			target,
			this._config
		);
	}

	/**
	 * Gradient of the loss with respect to the network output (∂L/∂ŷ).
	 *
	 * @param output - Network predictions.
	 * @param target - Ground-truth labels.
	 */
	private _computeLossGradient(
		output: Float32Array,
		target: Float32Array
	): Float32Array {
		return LOSSES[this._config.lossFunctionType].gradient(
			output,
			target,
			this._config
		);
	}

	/**
	 * Runs a forward pass through the network.
	 *
	 * **Stateless**: Returns an immutable {@link ForwardContext} containing all
	 * intermediate activations. Does NOT mutate internal layer state.
	 *
	 * This enables:
	 * - Parallel forward passes without interference
	 * - Async inference without race conditions
	 * - Explicit separation of computation context from weight storage
	 *
	 * @param input - Raw input vector. Length must match `neuronsByLayer[0]`.
	 * @throws {AgentError} When `input.length` does not match the input layer size.
	 * @returns {@link ForwardContext} containing output and all intermediate values.
	 */
	public forward(input: Float32Array): ForwardContext {
		const expected = this._config.neuronsByLayer[0];

		if (input.length !== expected) {
			throw new AppError(
				`Expected input size ${expected}, got ${input.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}

		const normalized = this._normalize(input);
		const originalInput = normalized;

		const layerZValues: Float32Array[] = [];
		const layerOutputs: Float32Array[] = [];

		let current = normalized;

		for (let layerIndex = 0; layerIndex < this._layers.length; layerIndex++) {
			const layer = this._layers[layerIndex];

			const weights = layer.weights;
			const bias = layer.bias;

			const fanIn = layer.fanIn;
			const fanOut = layer.fanOut;

			// Compute pre-activations (z) for this layer
			const preActivations = new Float32Array(fanOut);
			for (let j = 0; j < fanOut; j++) {
				let sum = this._config.useBias ? bias[j] : 0;

				const rowOffset = j * fanIn;
				for (let idx = 0; idx < fanIn; idx++) {
					sum += weights[rowOffset + idx] * current[idx];
				}

				preActivations[j] = sum;
			}

			// Compute post-activations (output) for this layer
			const Out = new Float32Array(fanOut);
			const activation = this._config.activationType[layerIndex];

			if (activation === "softmax") {
				let max = preActivations[0];

				for (let i = 1; i < fanOut; i++) {
					/* istanbul ignore if */ if (preActivations[i] > max) {
						max = preActivations[i];
					}
				}

				let expSum = 0;

				for (let i = 0; i < fanOut; i++) {
					const expVal = Math.exp(preActivations[i] - max);
					Out[i] = expVal;
					expSum += expVal;
				}

				const inv = 1 / expSum;

				for (let i = 0; i < fanOut; i++) {
					Out[i] *= inv;
				}
			} else {
				for (let i = 0; i < fanOut; i++) {
					Out[i] = this._activate(preActivations[i], activation);
				}
			}

			// Apply connection strategy (skip connections, residual, etc.)
			if (
				this._config.connectionType === "dense-skip" &&
				originalInput.length === Out.length
			) {
				for (let i = 0; i < Out.length; i++) {
					Out[i] += originalInput[i];
				}
			}

			// Store activations for this layer
			layerZValues.push(preActivations);
			layerOutputs.push(Out);

			current = Out;
		}

		return {
			input: normalized,
			output: current,
			layerZValues,
			layerOutputs,
		};
	}

	/** Run a forward pass and return only the output vector. */
	public predict(input: Float32Array): Float32Array {
		const context = this.forward(input);
		return context.output;
	}

	/**
	 * **INTERNAL**: Computes output layer deltas given loss gradient.
	 *
	 * Factored out to eliminate backprop/backpropAccumulate duplication.
	 *
	 * @param outputZ - Pre-activation values for output layer
	 * @param output - Post-activation values for output layer
	 * @param target - Ground truth labels
	 * @param activation - Activation function type for output layer
	 * @returns Delta values for output layer
	 */
	private _computeOutputDeltas(
		outputZ: Float32Array,
		output: Float32Array,
		target: Float32Array,
		activation: ActivationType
	): Float32Array {
		const delta = new Float32Array(output.length);
		const lossGrad = this._computeLossGradient(output, target);

		for (let j = 0; j < output.length; j++) {
			// Special case: softmax + cross-entropy => δ = ŷ - y
			if (activation === "softmax") {
				delta[j] = output[j] - target[j];
			} else {
				const actGrad = this._activationDerivative(
					output[j],
					outputZ[j],
					activation
				);
				delta[j] = lossGrad[j] * actGrad;
			}
		}

		return this._clipGradients(delta);
	}

	/**
	 * **INTERNAL**: Backpropagates error through hidden layers.
	 *
	 * Factored out to eliminate duplication between backprop and backpropAccumulate.
	 *
	 * @param nextLayerIndex - Index of the layer whose deltas are already computed
	 * @param nextDeltas - Deltas from the next (deeper) layer
	 * @param context - Forward context containing activations
	 * @returns Array of deltas for all layers from index 0 to nextLayerIndex-1
	 */
	private _computeHiddenDeltas(
		nextLayerIndex: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const deltas: Float32Array[] = [];

		for (let layerIdx = nextLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const current = this._layers[layerIdx];
			const next = this._layers[layerIdx + 1];

			const delta = new Float32Array(current.fanOut);
			const currentActivation = this._config.activationType[layerIdx];
			const currentOutput = context.layerOutputs[layerIdx];
			const currentZ = context.layerZValues[layerIdx];

			for (let i = 0; i < current.fanOut; i++) {
				let sum = 0;

				for (let j = 0; j < next.fanOut; j++) {
					const weight = next.weights[j * next.fanIn + i];
					sum += nextDeltas[j] * weight;
				}

				const grad = this._activationDerivative(
					currentOutput[i],
					currentZ[i],
					currentActivation
				);
				delta[i] = sum * grad;
			}

			deltas.unshift(this._clipGradients(delta));
			nextDeltas = delta; // For next iteration (backward)
		}

		return deltas;
	}

	/**
	 * **INTERNAL**: Computes and optionally applies gradients for a single layer.
	 *
	 * Factored out to support both immediate updates (backprop) and accumulation
	 * (mini-batch training).
	 *
	 * @param layerIndex - Which layer to update
	 * @param delta - Error signal for this layer's output neurons
	 * @param layerInput - Pre-activation values from previous layer (or raw input)
	 * @param applyImmediately - If true, apply gradients via optimizer; else accumulate
	 */
	private _computeLayerGradients(
		layerIndex: number,
		delta: Float32Array,
		layerInput: Float32Array,
		applyImmediately: boolean
	): void {
		const layer = this._layers[layerIndex];
		const { fanIn, fanOut, gradW, gradB, accumGradW, accumGradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];

			if (applyImmediately) {
				gradB[j] = deltaJ;
				this._computeWeightGradient(
					gradW,
					rowOffset,
					deltaJ,
					layerInput,
					fanIn
				);
			} else {
				accumGradB[j] += deltaJ;
				this._computeWeightGradient(
					accumGradW,
					rowOffset,
					deltaJ,
					layerInput,
					fanIn
				);
			}
		}

		if (applyImmediately) {
			const opt = OPTIMIZERS[this._config.optimizerType];
			const { weights, bias, wState, bState } = layer;

			opt.step(
				weights,
				gradW,
				wState,
				this._config.learningRate,
				this._optimizerHp
			);

			if (this._config.useBias) {
				opt.step(
					bias,
					gradB,
					bState,
					this._config.learningRate,
					this._optimizerHp
				);
			}
		}
	}

	private _computeWeightGradient(
		weightBuf: Float32Array,
		rowOffset: number,
		deltaJ: number,
		input: Float32Array,
		fanIn: number
	): void {
		for (let idxK = 0; idxK < fanIn; idxK++) {
			weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
		}
	}

	/**
	 * Performs full backpropagation using explicit forward context.
	 *
	 * **Refactored**: Eliminates hidden state coupling between forward() and backprop().
	 * All computation state is passed explicitly via {@link ForwardContext}.
	 *
	 * @param context - {@link ForwardContext} from corresponding forward() call
	 * @param target - Ground truth labels for loss computation
	 */
	private _backprop(context: ForwardContext, target: Float32Array): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		// 1. Compute output layer deltas
		const outputDelta = this._computeOutputDeltas(
			outputZ,
			output,
			target,
			outputActivation
		);

		// 2. Backpropagate to hidden layers
		const hiddenDeltas = this._computeHiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		// 3. Update all layers (apply gradients immediately)
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._computeLayerGradients(
				layerIdx,
				allDeltas[layerIdx],
				layerInput,
				true
			); // applyImmediately = true
		}
	}

	/**
	 * Performs backpropagation while **accumulating** gradients for mini-batch training.
	 *
	 * Instead of applying weight updates immediately, gradients are accumulated
	 * in `layer.accumGradW` and `layer.accumGradB`. Call {@link applyAccumulatedGradients}
	 * after processing a batch to apply averaged gradients.
	 *
	 * **Refactored**: Uses same delta computation as backprop(), eliminating
	 * duplication and sync bugs.
	 *
	 * @param context - {@link ForwardContext} from corresponding forward() call
	 * @param target - Ground truth labels for loss computation
	 */
	private _backpropAccumulate(
		context: ForwardContext,
		target: Float32Array
	): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		// 1. Compute output layer deltas (same as backprop)
		const outputDelta = this._computeOutputDeltas(
			outputZ,
			output,
			target,
			outputActivation
		);

		// 2. Backpropagate to hidden layers (same as backprop)
		const hiddenDeltas = this._computeHiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		// 3. Accumulate gradients (do NOT apply immediately)
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._computeLayerGradients(
				layerIdx,
				allDeltas[layerIdx],
				layerInput,
				false
			); // applyImmediately = false
		}
	}

	/**
	 * **INTERNAL**: Reconstructs a {@link ForwardContext} from stored {@link PooledExperience}.
	 *
	 * Needed because forwardAndPool() stores layer activations separately (for memory efficiency),
	 * but backpropAccumulate expects a ForwardContext.
	 *
	 * @param exp - Experience with stored activations
	 * @returns Reconstructed ForwardContext
	 */
	private _experienceToContext(exp: PooledExperience): ForwardContext {
		return {
			input: exp.input,
			output: exp.output,
			layerZValues: exp.layerActivations.map(
				(activation) => activation.zValues
			),
			layerOutputs: exp.layerActivations.map((activation) => activation.output),
		};
	}

	/**
	 * Performs one full train step (forward + backpropagation) on a single sample.
	 *
	 * @param input  - Input vector.
	 * @param target - Expected output vector.
	 * @returns Loss value for this sample
	 */
	public train(inputs: Float32Array, targets: Float32Array): number {
		const expectedInput = this._config.neuronsByLayer[0];
		const expectedOutput =
			this._config.neuronsByLayer[this._config.neuronsByLayer.length - 1];

		if (inputs.length !== expectedInput) {
			throw new AppError(
				`Expected input size ${expectedInput}, got ${inputs.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}

		if (targets.length !== expectedOutput) {
			throw new AppError(
				`Expected target size ${expectedOutput}, got ${targets.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}

		const context = this.forward(inputs);
		this._backprop(context, targets);

		return this._lossFunction(context.output, targets);
	}

	/**
	 * Performs a forward pass and stores the result in the learning pool.
	 *
	 * This allows batching multiple forward passes before performing a grouped
	 * backpropagation. Useful for mini-batch training, experience replay, or
	 * any learning scheme where gradients should be accumulated across multiple samples.
	 *
	 * @param input  - Input vector. Length must match `neuronsByLayer[0]`.
	 * @param target - Target output vector.
	 * @throws {AgentError} When pooling is disabled or input size doesn't match.
	 * @returns Loss value for this sample.
	 */
	public forwardAndPool(input: Float32Array, target: Float32Array): number {
		if (!this._config.enablePool) {
			throw new AppError(
				"Learning pool is disabled. Set enablePool: true in config.",
				ErrorCodes.AGENT_ERROR
			);
		}

		const expectedInput = this._config.neuronsByLayer[0];
		const expectedOutput =
			this._config.neuronsByLayer[this._config.neuronsByLayer.length - 1];

		if (input.length !== expectedInput) {
			throw new AppError(
				`Expected input size ${expectedInput}, got ${input.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}

		if (target.length !== expectedOutput) {
			throw new AppError(
				`Expected target size ${expectedOutput}, got ${target.length}`,
				ErrorCodes.AGENT_ERROR
			);
		}

		// Perform forward pass (stateless, returns context)
		const context = this.forward(input);
		const loss = this._lossFunction(context.output, target);

		// Store experience with context (not just activations)
		const experience: PooledExperience = {
			kind: "supervised",
			input: new Float32Array(input),
			output: new Float32Array(context.output),
			target: new Float32Array(target),
			layerActivations: context.layerOutputs.map((out, idx) => ({
				output: new Float32Array(out),
				preActivation: new Float32Array(context.layerZValues[idx]),
				zValues: new Float32Array(context.layerZValues[idx]),
			})),
			loss,
		};

		this._pool.push(experience);

		// Enforce max pool size (FIFO eviction)
		if (this._pool.length > this._config.poolMaxSize) {
			this._pool.shift();
		}

		return loss;
	}

	/**
	 * Internal method: applies averaged accumulated gradients to weights.
	 *
	 * Divides accumulated gradients by sample count, then applies via optimizer.
	 * Resets accumulators afterward.
	 *
	 * @param numSamples - Number of samples over which gradients were accumulated
	 */
	private _applyAccumulatedGradients(numSamples: number): void {
		/* istanbul ignore next */
		if (numSamples === 0) {
			return;
		}

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layer = this._layers[layerIdx];
			const {
				weights,
				bias,
				accumGradW,
				accumGradB,
				gradW,
				gradB,
				wState,
				bState,
			} = layer;
			const opt = OPTIMIZERS[this._config.optimizerType];

			// Average gradients by dividing by batch size
			const scale = 1 / numSamples;
			for (let i = 0; i < accumGradW.length; i++) {
				gradW[i] = accumGradW[i] * scale;
			}
			for (let i = 0; i < accumGradB.length; i++) {
				gradB[i] = accumGradB[i] * scale;
			}

			// Apply via optimizer
			opt.step(
				weights,
				gradW,
				wState,
				this._config.learningRate,
				this._optimizerHp
			);

			if (this._config.useBias) {
				opt.step(
					bias,
					gradB,
					bState,
					this._config.learningRate,
					this._optimizerHp
				);
			}

			// Reset accumulators for next batch
			accumGradW.fill(0);
			accumGradB.fill(0);
		}
	}

	/**
	 * Trains the network on all samples in the pool using grouped backpropagation.
	 *
	 * This performs the following steps:
	 * 1. Accumulates gradients from all experiences in the pool
	 * 2. Averages the accumulated gradients by the pool size
	 * 3. Applies a single weight update using the averaged gradients
	 * 4. Clears the pool
	 *
	 * Useful for mini-batch training, experience replay, or any learning
	 * scheme where multiple samples should contribute to a single weight update.
	 *
	 * @returns Average loss across all samples in the pool, or 0 if pool is empty.
	 * @throws {AgentError} When pooling is disabled.
	 */
	public trainPooled(): number {
		if (!this._config.enablePool) {
			throw new AppError(
				"Learning pool is disabled. Set enablePool: true in config.",
				ErrorCodes.AGENT_ERROR
			);
		}

		if (this._pool.length === 0) {
			return 0;
		}

		const poolSize = this._pool.length;

		// Reset accumulators
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._layers[layerIdx].accumGradW.fill(0);
			this._layers[layerIdx].accumGradB.fill(0);
		}

		let totalLoss = 0;

		// Accumulate gradients from all samples in the pool
		for (const experience of this._pool) {
			totalLoss += experience.loss;
			const context = this._experienceToContext(experience);
			this._backpropAccumulate(context, experience.target!);
		}

		// Apply accumulated gradients (averaged by pool size)
		this._applyAccumulatedGradients(poolSize);

		// Clear the pool
		this._pool.length = 0;

		return totalLoss / poolSize;
	}

	/**
	 * Returns the current size of the learning pool.
	 *
	 * Useful for monitoring when pool reaches a certain threshold before
	 * calling {@link trainPooled}.
	 *
	 * @returns Number of experiences currently in the pool.
	 */
	public getPoolSize(): number {
		return this._pool.length;
	}

	/**
	 * Clears all experiences from the learning pool without training.
	 *
	 * Use this if you want to discard accumulated experiences and start fresh.
	 */
	public clearPool(): void {
		this._pool.length = 0;
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
