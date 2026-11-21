import { ACTIVATIONS } from "@trading-model/model-runtime/neural-network/activation";
import {
	ConnectionType,
	type ForwardContext,
	type LayerMemory,
	type NeuralNetworkConfig,
} from "@trading-model/model-runtime/neural-network/type";
import { clipGradients } from "./utils";

export class HiddenDeltaComputer {
	constructor(
		private readonly _layers: LayerMemory[],
		private readonly _config: Required<NeuralNetworkConfig>
	) {}

	/** dL/dy of layer `layerIdx`: Wᵀ of the next deltas, plus the residual path from the layer above. */
	private _outputGradient(
		layerIdx: number,
		nextDeltas: Float32Array,
		aboveGrad?: Float32Array
	): Float32Array {
		const next = this._layers[layerIdx + 1];
		const grad = new Float32Array(next.fanIn);
		for (let i = 0; i < next.fanIn; i++) {
			let sum = 0;
			for (let j = 0; j < next.fanOut; j++) {
				sum += nextDeltas[j] * next.weights[j * next.fanIn + i];
			}
			grad[i] = sum;
		}
		if (aboveGrad) {
			// Mirrors the forward truncation / zero-padding of the residual projection.
			const count = Math.min(grad.length, aboveGrad.length);
			for (let i = 0; i < count; i++) {
				grad[i] += aboveGrad[i];
			}
		}
		return grad;
	}

	/** Delta = dL/dy · f'(z), with f' taken from f(z), never from the output after the skip term. */
	private _activationDelta(
		layerIdx: number,
		outGrad: Float32Array,
		context: ForwardContext
	): Float32Array {
		const { fn, derivative } =
			ACTIVATIONS[this._config.activationType[layerIdx]];
		const zValues = context.layerZValues[layerIdx];
		const delta = new Float32Array(outGrad.length);
		for (let i = 0; i < delta.length; i++) {
			delta[i] = outGrad[i] * derivative(fn(zValues[i]), zValues[i]);
		}
		return clipGradients(delta, this._config.gradientClipNorm);
	}

	compute(
		nextLayerIndex: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const deltas: Float32Array[] = [];
		let aboveGrad: Float32Array | undefined;
		for (let layerIdx = nextLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const outGrad = this._outputGradient(layerIdx, nextDeltas, aboveGrad);
			const delta = this._activationDelta(layerIdx, outGrad, context);
			deltas.unshift(delta);
			nextDeltas = delta;
			aboveGrad =
				this._config.connectionType === ConnectionType.ResidualConnection
					? outGrad
					: undefined;
		}
		return deltas;
	}
}
