import type {
	LayerGradientContext,
	WeightGradientContext,
} from "./backprop-engine";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OPTIMIZERS } from "./optimizer";
import type { LayerMemory } from "./type";

function computeWeightGradient(ctx: WeightGradientContext): void {
	const { weightBuf, rowOffset, deltaJ, input, fanIn } = ctx;
	for (let idxK = 0; idxK < fanIn; idxK++) {
		weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
	}
}

export class GradientApplier {
	constructor(private readonly _deps: NnTrainingDeps) {}

	computeGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput } = ctx;
		this._applyGradientsToLayer(
			this._deps.layers[layerIndex],
			delta,
			layerInput
		);
	}

	private _computeGradientsForLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, gradW, gradB } = layer;
		// computeWeightGradient adds into the buffer: start each sample from zero
		// so an immediate step never re-applies earlier samples' gradients.
		gradW.fill(0);
		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			gradB[j] = deltaJ;
			computeWeightGradient({
				weightBuf: gradW,
				rowOffset,
				deltaJ,
				input: layerInput,
				fanIn,
			});
		}
	}

	private _applyOptimizerStepToLayer(layer: LayerMemory): void {
		const opt = OPTIMIZERS[this._deps.config.optimizerType];
		opt.step({
			params: layer.weights,
			grads: layer.gradW,
			state: layer.wState,
			lr: this._deps.config.learningRate,
			hp: this._deps.optimizerHp,
		});
		if (this._deps.config.useBias) {
			opt.step({
				params: layer.bias,
				grads: layer.gradB,
				state: layer.bState,
				lr: this._deps.config.learningRate,
				hp: this._deps.optimizerHp,
			});
		}
	}

	private _applyGradientsToLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		this._computeGradientsForLayer(layer, delta, layerInput);
		this._applyOptimizerStepToLayer(layer);
	}
}
