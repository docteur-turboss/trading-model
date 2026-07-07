import type { LayerGradientContext } from "./backprop-engine";
import {
	computeWeightGradient,
	GradientAccumulator,
} from "./gradient-accumulator";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OPTIMIZERS } from "./optimizer";
import type { LayerMemory } from "./type";

export class GradientApplier {
	private readonly _accumulator: GradientAccumulator;

	constructor(private readonly _deps: NnTrainingDeps) {
		this._accumulator = new GradientAccumulator(this._deps);
	}

	computeGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput, applyImmediately } = ctx;
		const layer = this._deps.layers[layerIndex];

		if (applyImmediately) {
			this._applyGradientsToLayer(layer, delta, layerInput);
		} else {
			this._accumulator.accumulate(layer, delta, layerInput);
		}
	}

	applyAccumulatedGradients(numSamples: number): void {
		if (numSamples === 0) {
			return;
		}

		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			this._accumulator.averageAndApply(
				this._deps.layers[layerIdx],
				numSamples
			);
		}
	}

	resetAccumulators(): void {
		this._accumulator.resetAccumulators();
	}

	private _computeGradientsForLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, gradW, gradB } = layer;
		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			gradB[j] = deltaJ;
			computeWeightGradient({ weightBuf: gradW, rowOffset, deltaJ, input: layerInput, fanIn });
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
