import { agentError } from "../errors";
import { LayerComputer } from "./layer-computer";
import { NORMALIZERS, type NormalizeParams } from "./normalizers";
import type { ForwardContext, LayerMemory, NeuralNetworkConfig } from "./type";

export class FeedForwardEngine {
	private readonly _layerComputer: LayerComputer;

	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[]
	) {
		this._layerComputer = new LayerComputer({
			activationType: this._config.activationType,
			connectionType: this._config.connectionType,
			useBias: this._config.useBias,
		});
	}

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
			const { preActivations, output } = this._layerComputer.computeLayerOutput(
				{
					layer: this._layers[layerIndex],
					current,
					layerIndex,
					originalInput,
				}
			);
			layerZValues.push(preActivations);
			layerOutputs.push(output);
			current = output;
		}

		return { current, layerZValues, layerOutputs };
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
			{ data, len },
			params
		);
	}
}
