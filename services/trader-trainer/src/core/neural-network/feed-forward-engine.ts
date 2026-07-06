import { agentError } from "@trading-model/common/utils/errors";

import { NORMALIZERS, type NormalizeParams } from "./normalize";
import type {
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";
import { LayerComputer } from "./layer-computer";

export interface LayerOutputContext {
	layer: LayerMemory;
	current: Float32Array;
	layerIndex: number;
	originalInput: Float32Array;
}

export class FeedForwardEngine {
	private readonly _layerComputer: LayerComputer;

	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[]
	) {
		this._layerComputer = new LayerComputer(
			this._config.activationType,
			this._config.connectionType,
			this._config.useBias
		);
	}

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
			const { preActivations, output } = this._layerComputer.computeLayerOutput(
				layer,
				current,
				layerIndex,
				originalInput
			);

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
		params?: NormalizeParams
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
}
