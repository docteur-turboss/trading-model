import { ActivationComputer } from "./activation-computer";
import type { LayerMemory } from "./type";
import { ActivationType, ConnectionType } from "./type";

export class LayerComputer {
	private readonly _activationType: ActivationType[];
	private readonly _connectionType: ConnectionType;
	private readonly _useBias: boolean;
	private readonly _activationComputer = new ActivationComputer();

	constructor(
		activationType: ActivationType[],
		connectionType: ConnectionType,
		useBias: boolean
	) {
		this._activationType = activationType;
		this._connectionType = connectionType;
		this._useBias = useBias;
	}

	computePreActivations(layer: LayerMemory, input: Float32Array): Float32Array {
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
			output = this._activationComputer.applySoftmax(preActivations);
		} else {
			output = this._activationComputer.applyElementWiseActivation(
				preActivations,
				activation
			);
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
}
