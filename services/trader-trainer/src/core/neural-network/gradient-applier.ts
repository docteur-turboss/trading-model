import { OPTIMIZERS, type OptimizerHyperparams } from "./optimizer";
import type { LayerMemory, NeuralNetworkConfig } from "./type";
import type { LayerGradientContext, WeightGradientContext } from "./backprop-engine";

export class GradientApplier {
	constructor(
		private readonly _layers: LayerMemory[],
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _optimizerHp: OptimizerHyperparams
	) {}

	computeGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput, applyImmediately } = ctx;
		const layer = this._layers[layerIndex];

		if (applyImmediately) {
			this._applyGradientsToLayer(layer, delta, layerInput);
		} else {
			this._accumulateGradients(layer, delta, layerInput);
		}
	}

	applyAccumulatedGradients(numSamples: number): void {
		if (numSamples === 0) {
			return;
		}

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._averageAndApplyGradients(this._layers[layerIdx], numSamples);
		}
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._layers[layerIdx].accumGradW.fill(0);
			this._layers[layerIdx].accumGradB.fill(0);
		}
	}

	private _computeWeightGradient(
		ctx: WeightGradientContext
	): void {
		const { weightBuf, rowOffset, deltaJ, input, fanIn } = ctx;
		for (let idxK = 0; idxK < fanIn; idxK++) {
			weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
		}
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
			this._computeWeightGradient({ weightBuf: gradW, rowOffset, deltaJ, input: layerInput, fanIn });
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

	private _accumulateGradients(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, accumGradW, accumGradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			accumGradB[j] += deltaJ;
			this._computeWeightGradient({ weightBuf: accumGradW, rowOffset, deltaJ, input: layerInput, fanIn });
		}
	}

	private _averageAndApplyGradients(
		layer: LayerMemory,
		numSamples: number
	): void {
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
}
