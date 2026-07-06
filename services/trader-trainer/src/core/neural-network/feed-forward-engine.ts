import { AppError, agentError } from "@trading-model/common/utils/errors";

import { ACTIVATIONS } from "./activation";
import { NORMALIZERS } from "./normalize";
import {
	ActivationType,
	ConnectionType,
} from "./type";
import type {
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";

export interface LayerOutputContext {
	layer: LayerMemory;
	current: Float32Array;
	layerIndex: number;
	originalInput: Float32Array;
}

export class FeedForwardEngine {
	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[]
	) {}

	forward(input: Float32Array): ForwardContext {
		const expected = this._config.neuronsByLayer[0];

		if (input.length !== expected) {
			throw agentError(
				`Expected input size ${expected}, got ${input.length}`
			);
		}

		const normalized = this._normalize(input);
		const originalInput = normalized;

		const layerZValues: Float32Array[] = [];
		const layerOutputs: Float32Array[] = [];

		let current = normalized;

		for (let layerIndex = 0; layerIndex < this._layers.length; layerIndex++) {
			const layer = this._layers[layerIndex];
			const { preActivations, output } = this._computeLayerOutput({
				layer,
				current,
				layerIndex,
				originalInput,
			});

			layerZValues.push(preActivations);
			layerOutputs.push(output);

			current = output;
		}

		return {
			input: normalized,
			output: current,
			layerZValues,
			layerOutputs,
		};
	}

	predict(input: Float32Array): Float32Array {
		const context = this.forward(input);
		return context.output;
	}

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

	private _computePreActivations(
		layer: LayerMemory,
		input: Float32Array
	): Float32Array {
		const fanIn = layer.fanIn;
		const fanOut = layer.fanOut;
		const weights = layer.weights;
		const bias = layer.bias;

		const preActivations = new Float32Array(fanOut);
		for (let j = 0; j < fanOut; j++) {
			let sum = this._config.useBias ? bias[j] : 0;
			const rowOffset = j * fanIn;
			for (let idx = 0; idx < fanIn; idx++) {
				sum += weights[rowOffset + idx] * input[idx];
			}
			preActivations[j] = sum;
		}
		return preActivations;
	}

	private _findMax(preActivations: Float32Array): number {
		let max = preActivations[0];
		for (let i = 1; i < preActivations.length; i++) {
			if (preActivations[i] > max) {
				max = preActivations[i];
			}
		}
		return max;
	}

	private _computeExpSum(preActivations: Float32Array, max: number): { Out: Float32Array; expSum: number } {
		const Out = new Float32Array(preActivations.length);
		let expSum = 0;
		for (let i = 0; i < preActivations.length; i++) {
			const expVal = Math.exp(preActivations[i] - max);
			Out[i] = expVal;
			expSum += expVal;
		}
		return { Out, expSum };
	}

	private _applySoftmax(preActivations: Float32Array): Float32Array {
		const max = this._findMax(preActivations);
		const { Out, expSum } = this._computeExpSum(preActivations, max);
		const inv = 1 / expSum;
		for (let i = 0; i < Out.length; i++) {
			Out[i] *= inv;
		}
		return Out;
	}

	private _applyElementWiseActivation(
		preActivations: Float32Array,
		activation: ActivationType
	): Float32Array {
		const fanOut = preActivations.length;
		const Out = new Float32Array(fanOut);
		for (let i = 0; i < fanOut; i++) {
			Out[i] = this._activate(preActivations[i], activation);
		}
		return Out;
	}

	private _activate(input: number, activation: ActivationType): number {
		return ACTIVATIONS[activation].fn(input);
	}

	private _computeLayerOutput(
		ctx: LayerOutputContext
	): { preActivations: Float32Array; output: Float32Array } {
		const { layer, current, layerIndex, originalInput } = ctx;
		const preActivations = this._computePreActivations(layer, current);
		const activation = this._config.activationType[layerIndex];

		let output: Float32Array;
		if (activation === ActivationType.Softmax) {
			output = this._applySoftmax(preActivations);
		} else {
			output = this._applyElementWiseActivation(preActivations, activation);
		}

		if (
			this._config.connectionType === ConnectionType.DenseSkip &&
			originalInput.length === output.length
		) {
			for (let i = 0; i < output.length; i++) {
				output[i] += originalInput[i];
			}
		}

		return { preActivations, output };
	}
}
