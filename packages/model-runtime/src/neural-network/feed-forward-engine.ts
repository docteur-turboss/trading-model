import { agentError } from "../errors";
import { ACTIVATIONS } from "./activation";
import { NORMALIZERS } from "./normalizers";
import {
	ConnectionType,
	type ForwardContext,
	type LayerMemory,
	type NeuralNetworkConfig,
	NormalisationType,
} from "./type";

export class FeedForwardEngine {
	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[]
	) {}

	forward(input: Float32Array): ForwardContext {
		const expected = this._config.neuronsByLayer[0];

		if (input.length !== expected) {
			throw agentError(`Expected input size ${expected}, got ${input.length}`);
		}

		const normalized = this._normalize(input);
		const layerResult = this._computeLayers(normalized);

		return {
			input: normalized,
			output: layerResult.current,
			layerZValues: layerResult.layerZValues,
			layerOutputs: layerResult.layerOutputs,
		};
	}

	private _computeLayers(input: Float32Array): {
		current: Float32Array;
		layerZValues: Float32Array[];
		layerOutputs: Float32Array[];
	} {
		const originalInput = input;
		const layerZValues: Float32Array[] = [];
		const layerOutputs: Float32Array[] = [];
		let current = input;

		for (let layerIndex = 0; layerIndex < this._layers.length; layerIndex++) {
			const zValues = this._preActivations(this._layers[layerIndex], current);
			const skip =
				this._config.connectionType === ConnectionType.ResidualConnection
					? current
					: originalInput;
			const output = this._activate(zValues, layerIndex, skip);
			layerZValues.push(zValues);
			layerOutputs.push(output);
			current = output;
		}

		return { current, layerZValues, layerOutputs };
	}

	private _preActivations(
		layer: LayerMemory,
		input: Float32Array
	): Float32Array {
		const { fanIn, fanOut, weights, bias } = layer;
		const zValues = new Float32Array(fanOut);
		for (let j = 0; j < fanOut; j++) {
			let sum = this._config.useBias ? bias[j] : 0;
			const rowOffset = j * fanIn;
			for (let idx = 0; idx < fanIn; idx++) {
				sum += weights[rowOffset + idx] * input[idx];
			}
			zValues[j] = sum;
		}
		return zValues;
	}

	/** Activation of `zValues` into a new array, plus the skip term: DenseSkip adds `skip` where sizes match; ResidualConnection adds it to hidden layers, truncated or zero-padded (no parameters). */
	private _activate(
		zValues: Float32Array,
		layerIndex: number,
		skip: Float32Array
	): Float32Array {
		const { fn } = ACTIVATIONS[this._config.activationType[layerIndex]];
		const output = new Float32Array(zValues.length);
		for (let i = 0; i < output.length; i++) {
			output[i] = fn(zValues[i]);
		}
		if (
			this._config.connectionType === ConnectionType.DenseSkip &&
			skip.length === output.length
		) {
			for (let i = 0; i < output.length; i++) {
				output[i] += skip[i];
			}
		}
		if (
			this._config.connectionType === ConnectionType.ResidualConnection &&
			layerIndex < this._layers.length - 1
		) {
			const count = Math.min(skip.length, output.length);
			for (let i = 0; i < count; i++) {
				output[i] += skip[i];
			}
		}
		return output;
	}

	private _normalize(input: Float32Array): Float32Array {
		if (this._config.normalisationType === NormalisationType.None) {
			return input;
		}
		const data = new Float32Array(input);
		const len = data.length;

		if (len === 0) {
			return data;
		}
		return NORMALIZERS[this._config.normalisationType].normalize({ data, len });
	}
}
