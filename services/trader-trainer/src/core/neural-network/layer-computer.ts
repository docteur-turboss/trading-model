import { ACTIVATIONS } from "./activation";
import { ActivationType, ConnectionType } from "./type";
import type { LayerMemory } from "./type";

export class LayerComputer {
	private readonly _activationType: ActivationType[];
	private readonly _connectionType: ConnectionType;
	private readonly _useBias: boolean;

	constructor(
		activationType: ActivationType[],
		connectionType: ConnectionType,
		useBias: boolean
	) {
		this._activationType = activationType;
		this._connectionType = connectionType;
		this._useBias = useBias;
	}

	computePreActivations(
		layer: LayerMemory,
		input: Float32Array
	): Float32Array {
		const fanIn = layer.fanIn;
		const fanOut = layer.fanOut;
		const weights = layer.weights;
		const bias = layer.bias;

		const preActivations = new Float32Array(fanOut);
		for (let j = 0; j < fanOut; j++) {
			let sum = this._useBias ? bias[j] : 0;
			const rowOffset = j * fanIn;
			for (let idx = 0; idx < fanIn; idx++) {
				sum += weights[rowOffset + idx] * input[idx];
			}
			preActivations[j] = sum;
		}
		return preActivations;
	}

	computeLayerOutput(
		layer: LayerMemory,
		current: Float32Array,
		layerIndex: number,
		originalInput: Float32Array
	): { preActivations: Float32Array; output: Float32Array } {
		const preActivations = this.computePreActivations(layer, current);
		const activation = this._activationType[layerIndex];

		let output: Float32Array;
		if (activation === ActivationType.Softmax) {
			output = this._applySoftmax(preActivations);
		} else {
			output = this._applyElementWiseActivation(preActivations, activation);
		}

		if (
			this._connectionType === ConnectionType.DenseSkip &&
			originalInput.length === output.length
		) {
			for (let i = 0; i < output.length; i++) {
				output[i] += originalInput[i];
			}
		}

		return { preActivations, output };
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

	private _computeExpSum(
		preActivations: Float32Array,
		max: number
	): { Out: Float32Array; expSum: number } {
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
}
