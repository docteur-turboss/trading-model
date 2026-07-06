import { ACTIVATIONS } from "./activation";
import type {
	ActivationType,
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";

export class HiddenDeltaComputer {
	constructor(
		private readonly _layers: LayerMemory[],
		private readonly _config: Required<NeuralNetworkConfig>
	) {}

	compute(
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
			nextDeltas = delta;
		}

		return deltas;
	}

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
}
