import type { LayerGradientContext } from "./backprop-engine";
import {
	computeWeightGradient,
	GradientAccumulator,
} from "./gradient-accumulator";
import { OPTIMIZERS, type OptimizerHyperparams } from "./optimizer";
import type { LayerMemory, NeuralNetworkConfig } from "./type";

export class GradientApplier {
	private readonly _accumulator: GradientAccumulator;

	constructor(
		private readonly _layers: LayerMemory[],
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _optimizerHp: OptimizerHyperparams
	) {
		this._accumulator = new GradientAccumulator(
			this._layers,
			this._config,
			this._optimizerHp
		);
	}

	computeGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput, applyImmediately } = ctx;
		const layer = this._layers[layerIndex];

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

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._accumulator.averageAndApply(this._layers[layerIdx], numSamples);
		}
	}

	resetAccumulators(): void {
		this._accumulator.resetAccumulators();
	}

	private _applyGradientsToLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, gradW, gradB } = layer;

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

		const opt = OPTIMIZERS[this._config.optimizerType];
		const { weights, bias, wState, bState } = layer;

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
	}
}
