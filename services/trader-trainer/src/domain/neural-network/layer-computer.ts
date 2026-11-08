import { ACTIVATIONS } from "./activation";
import type { LayerMemory } from "./type";
import { type ActivationType, ConnectionType } from "./type";

export interface LayerComputationContext {
	layer: LayerMemory;
	current: Float32Array;
	layerIndex: number;
	originalInput: Float32Array;
}

interface LayerComputerConfig {
	activationType: ActivationType[];
	connectionType: ConnectionType;
	useBias: boolean;
}

export class LayerComputer {
	private readonly _activationType: ActivationType[];
	private readonly _connectionType: ConnectionType;
	private readonly _useBias: boolean;

	constructor(config: LayerComputerConfig) {
		this._activationType = config.activationType;
		this._connectionType = config.connectionType;
		this._useBias = config.useBias;
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

	private _applyActivation(
		preActivations: Float32Array,
		activation: ActivationType
	): Float32Array {
		const { fn } = ACTIVATIONS[activation];
		return preActivations.map((value) => fn(value));
	}

	private _applySkipConnection(
		output: Float32Array,
		originalInput: Float32Array
	): void {
		if (this._connectionType !== ConnectionType.DenseSkip) {
			return;
		}
		if (originalInput.length === output.length) {
			for (let i = 0; i < output.length; i++) {
				output[i] += originalInput[i];
			}
		}
	}

	computeLayerOutput(ctx: LayerComputationContext): {
		preActivations: Float32Array;
		output: Float32Array;
	} {
		const { layer, current, layerIndex, originalInput } = ctx;
		const preActivations = this.computePreActivations(layer, current);
		const output = this._applyActivation(
			preActivations,
			this._activationType[layerIndex]
		);
		this._applySkipConnection(output, originalInput);
		return { preActivations, output };
	}
}
