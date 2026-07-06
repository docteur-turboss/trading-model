import type { WeightGradientContext } from "./backprop-engine";
import { OPTIMIZERS, type OptimizerHyperparams } from "./optimizer";
import type { LayerMemory, NeuralNetworkConfig } from "./type";

function computeWeightGradient(ctx: WeightGradientContext): void {
	const { weightBuf, rowOffset, deltaJ, input, fanIn } = ctx;
	for (let idxK = 0; idxK < fanIn; idxK++) {
		weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
	}
}

export { computeWeightGradient };

export class GradientAccumulator {
	constructor(
		private readonly _layers: LayerMemory[],
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _optimizerHp: OptimizerHyperparams
	) {}

	accumulate(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, accumGradW, accumGradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			accumGradB[j] += deltaJ;
			computeWeightGradient({
				weightBuf: accumGradW,
				rowOffset,
				deltaJ,
				input: layerInput,
				fanIn,
			});
		}
	}

	averageAndApply(layer: LayerMemory, numSamples: number): void {
		const {
			weights,
			bias,
			accumGradW,
			accumGradB,
			gradW,
			gradB,
			wState,
			bState,
		} = layer;
		const opt = OPTIMIZERS[this._config.optimizerType];

		const scale = 1 / numSamples;
		for (let i = 0; i < accumGradW.length; i++) {
			gradW[i] = accumGradW[i] * scale;
		}
		for (let i = 0; i < accumGradB.length; i++) {
			gradB[i] = accumGradB[i] * scale;
		}

		opt.step({
			params: weights,
			grads: gradW,
			state: wState,
			lr: this._config.learningRate,
			hp: this._optimizerHp,
		});

		if (this._config.useBias) {
			opt.step({
				params: bias,
				grads: gradB,
				state: bState,
				lr: this._config.learningRate,
				hp: this._optimizerHp,
			});
		}

		accumGradW.fill(0);
		accumGradB.fill(0);
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._layers[layerIdx].accumGradW.fill(0);
			this._layers[layerIdx].accumGradB.fill(0);
		}
	}
}
