import type { WeightGradientContext } from "./backprop-engine";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OPTIMIZERS } from "./optimizer";
import type { LayerMemory } from "./type";

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

		this._scaleGradients(accumGradW, accumGradB, gradW, gradB, numSamples);
		this._applyOptimizerStep(opt, weights, gradW, wState);
		if (this._deps.config.useBias) {
			this._applyOptimizerStep(opt, bias, gradB, bState);
		}

		accumGradW.fill(0);
		accumGradB.fill(0);
	}

	private _scaleGradients(
		accumGradW: Float32Array,
		accumGradB: Float32Array,
		gradW: Float32Array,
		gradB: Float32Array,
		numSamples: number
	): void {
		const scale = 1 / numSamples;
		for (let i = 0; i < accumGradW.length; i++) {
			gradW[i] = accumGradW[i] * scale;
		}
		for (let i = 0; i < accumGradB.length; i++) {
			gradB[i] = accumGradB[i] * scale;
		}
	}

	private _applyOptimizerStep(
		opt: {
			step: (opts: {
				params: Float32Array;
				grads: Float32Array;
				state: Float32Array;
				lr: number;
				hp: Record<string, number>;
			}) => void;
		},
		params: Float32Array,
		grads: Float32Array,
		state: Float32Array
	): void {
		opt.step({
			params,
			grads,
			state,
			lr: this._deps.config.learningRate,
			hp: this._deps.optimizerHp,
		});
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			this._deps.layers[layerIdx].accumGradW.fill(0);
			this._deps.layers[layerIdx].accumGradB.fill(0);
		}
	}
}
