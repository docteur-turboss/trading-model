import type { LayerGradientContext } from "./backprop-engine";
import type { NnTrainingDeps } from "./nn-training-deps";
import type { LayerMemory } from "./type";

function sgdStep(params: Float32Array, grads: Float32Array, lr: number): void {
	for (let i = 0; i < params.length; i++) {
		params[i] -= lr * grads[i];
	}
}

export class GradientApplier {
	constructor(private readonly _deps: NnTrainingDeps) {}

	computeGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput } = ctx;
		const layer = this._deps.layers[layerIndex];
		this._computeGradientsForLayer(layer, delta, layerInput);
		this._applyOptimizerStepToLayer(layer);
	}

	private _computeGradientsForLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, gradW, gradB } = layer;
		// Assign, never accumulate: an immediate step must not re-apply earlier samples' gradients.
		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			gradB[j] = deltaJ;
			for (let idxK = 0; idxK < fanIn; idxK++) {
				gradW[rowOffset + idxK] = deltaJ * layerInput[idxK];
			}
		}
	}

	/** Plain SGD: the only optimizer training uses. */
	private _applyOptimizerStepToLayer(layer: LayerMemory): void {
		const lr = this._deps.config.learningRate;
		sgdStep(layer.weights, layer.gradW, lr);
		if (this._deps.config.useBias) {
			sgdStep(layer.bias, layer.gradB, lr);
		}
	}
}
