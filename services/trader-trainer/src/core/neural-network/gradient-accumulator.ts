import type { WeightGradientContext } from "./backprop-engine";
import { OPTIMIZERS } from "./optimizer";
import type { LayerMemory } from "./type";
import type { NnTrainingDeps } from "./nn-training-deps";

function computeWeightGradient(ctx: WeightGradientContext): void {
	const { weightBuf, rowOffset, deltaJ, input, fanIn } = ctx;
	for (let idxK = 0; idxK < fanIn; idxK++) {
		weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
	}
}

export { computeWeightGradient };

export class GradientAccumulator {
	constructor(private readonly _deps: NnTrainingDeps) {}

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
		const opt = OPTIMIZERS[this._deps.config.optimizerType];

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
			lr: this._deps.config.learningRate,
			hp: this._deps.optimizerHp,
		});

		if (this._deps.config.useBias) {
			opt.step({
				params: bias,
				grads: gradB,
				state: bState,
				lr: this._deps.config.learningRate,
				hp: this._deps.optimizerHp,
			});
		}

		accumGradW.fill(0);
		accumGradB.fill(0);
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			this._deps.layers[layerIdx].accumGradW.fill(0);
			this._deps.layers[layerIdx].accumGradB.fill(0);
		}
	}
}
