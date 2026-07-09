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

	private _backpropagateDelta(
		neuronIdx: number,
		next: LayerMemory,
		nextDeltas: Float32Array
	): number {
		let sum = 0;
		for (let j = 0; j < next.fanOut; j++) {
			sum += nextDeltas[j] * next.weights[j * next.fanIn + neuronIdx];
		}
		return sum;
	}

	private _computeNeuronDelta(
		neuronIdx: number,
		next: LayerMemory,
		nextDeltas: Float32Array,
		currentOutput: Float32Array,
		currentZ: Float32Array,
		activation: ActivationType
	): number {
		const sum = this._backpropagateDelta(neuronIdx, next, nextDeltas);
		const grad = this._activationDerivative(
			currentOutput[neuronIdx],
			currentZ[neuronIdx],
			activation
		);
		return sum * grad;
	}

	private _computeLayerDelta(
		layerIdx: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array {
		const current = this._layers[layerIdx];
		const next = this._layers[layerIdx + 1];
		const activation = this._config.activationType[layerIdx];
		const currentOutput = context.layerOutputs[layerIdx];
		const currentZ = context.layerZValues[layerIdx];
		const delta = new Float32Array(current.fanOut);
		for (let i = 0; i < current.fanOut; i++) {
			delta[i] = this._computeNeuronDelta(
				i,
				next,
				nextDeltas,
				currentOutput,
				currentZ,
				activation
			);
		}
		return this._clipGradients(delta);
	}

	compute(
		nextLayerIndex: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const deltas: Float32Array[] = [];
		for (let layerIdx = nextLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const delta = this._computeLayerDelta(layerIdx, nextDeltas, context);
			deltas.unshift(delta);
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
