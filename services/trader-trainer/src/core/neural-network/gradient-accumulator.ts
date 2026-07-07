import type { WeightGradientContext } from "./backprop-engine";
import type { NnTrainingDeps } from "./nn-training-deps";
import { type OptimizerState, OPTIMIZERS, type Optimizer } from "./optimizer";
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

	private _accumulateGradientForNeuron(
		layer: LayerMemory,
		j: number,
		deltaJ: number,
		layerInput: Float32Array
	): void {
		const { fanIn, accumGradW, accumGradB } = layer;
		accumGradB[j] += deltaJ;
		computeWeightGradient({ weightBuf: accumGradW, rowOffset: j * fanIn, deltaJ, input: layerInput, fanIn });
	}

	accumulate(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		for (let j = 0; j < layer.fanOut; j++) {
			this._accumulateGradientForNeuron(layer, j, delta[j], layerInput);
		}
	}

	private _applyWeightOptimizerStep(layer: LayerMemory): void {
		const opt = OPTIMIZERS[this._deps.config.optimizerType];
		this._applyOptimizerStep(opt, layer.weights, layer.gradW, layer.wState);
	}

	private _applyBiasOptimizerStep(layer: LayerMemory): void {
		if (!this._deps.config.useBias) return;
		const opt = OPTIMIZERS[this._deps.config.optimizerType];
		this._applyOptimizerStep(opt, layer.bias, layer.gradB, layer.bState);
	}

	averageAndApply(layer: LayerMemory, numSamples: number): void {
		this._scaleGradients(layer.accumGradW, layer.accumGradB, layer.gradW, layer.gradB, numSamples);
		this._applyWeightOptimizerStep(layer);
		this._applyBiasOptimizerStep(layer);
		layer.accumGradW.fill(0);
		layer.accumGradB.fill(0);
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
		opt: Optimizer,
		params: Float32Array,
		grads: Float32Array,
		state: OptimizerState
	): void {
		opt.step({
			params,
			grads,
			state,
			lr: this._deps.config.learningRate,
			hp: this._deps.optimizerHp,
		} as Parameters<Optimizer["step"]>[0]);
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			this._deps.layers[layerIdx].accumGradW.fill(0);
			this._deps.layers[layerIdx].accumGradB.fill(0);
		}
	}
}
