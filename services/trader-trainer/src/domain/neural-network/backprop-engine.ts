import { ACTIVATIONS } from "@trading-model/model-runtime/neural-network/activation";
import {
	ConnectionType,
	type ForwardContext,
	type LayerMemory,
} from "@trading-model/model-runtime/neural-network/type";
import type { NnTrainingDeps } from "./nn-training-deps";
import { clipGradients } from "./utils";

function validateLengths(output: Float32Array, target: Float32Array): void {
	if (output.length !== target.length) {
		throw new RangeError(
			`Loss function input/output length mismatch: output.length=${output.length}, target.length=${target.length}`
		);
	}
}

/** Mean squared error: the only loss training uses. */
export function mseLoss(output: Float32Array, target: Float32Array): number {
	validateLengths(output, target);
	let sum = 0;
	for (let i = 0; i < output.length; i++) {
		const err = target[i] - output[i];
		sum += err * err;
	}
	return sum / output.length;
}

/** Gradient of {@link mseLoss}: 2 (o - t) / n. */
export function mseGradient(
	output: Float32Array,
	target: Float32Array
): Float32Array {
	validateLengths(output, target);
	const len = output.length;
	const invN = 1 / len;
	const out = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		out[i] = 2 * (output[i] - target[i]) * invN;
	}
	return out;
}

function sgdStep(params: Float32Array, grads: Float32Array, lr: number): void {
	for (let i = 0; i < params.length; i++) {
		params[i] -= lr * grads[i];
	}
}

/** Plain SGD, the only optimizer training uses: sets the layer gradients, then steps. */
function applyLayerGradients(
	layer: LayerMemory,
	delta: Float32Array,
	layerInput: Float32Array,
	deps: NnTrainingDeps
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
	const lr = deps.config.learningRate;
	sgdStep(layer.weights, gradW, lr);
	if (deps.config.useBias) {
		sgdStep(layer.bias, gradB, lr);
	}
}

export class BackpropEngine {
	constructor(private readonly _deps: NnTrainingDeps) {}

	private _computeOutputDelta(
		context: ForwardContext,
		target: Float32Array
	): Float32Array {
		const { layers, config } = this._deps;
		const last = layers.length - 1;
		const outputZ = context.layerZValues[last];
		const output = context.layerOutputs[last];
		const lossGrad = mseGradient(output, target);
		const delta = new Float32Array(output.length);
		const { fn, derivative } = ACTIVATIONS[config.activationType[last]];
		for (let j = 0; j < output.length; j++) {
			// `output` may include the DenseSkip residual: derive from the pre-skip value.
			delta[j] = lossGrad[j] * derivative(fn(outputZ[j]), outputZ[j]);
		}
		return clipGradients(delta, config.gradientClipNorm);
	}

	/** Deltas of layers 0..lastLayerIndex-1, back from the output delta. */
	private _hiddenDeltas(
		lastLayerIndex: number,
		outputDelta: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const { layers, config } = this._deps;
		const residual =
			config.connectionType === ConnectionType.ResidualConnection;
		const deltas: Float32Array[] = [];
		let nextDeltas = outputDelta;
		let aboveGrad: Float32Array | undefined;
		for (let layerIdx = lastLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const next = layers[layerIdx + 1];
			const { fn, derivative } = ACTIVATIONS[config.activationType[layerIdx]];
			const zs = context.layerZValues[layerIdx];
			// dL/dy: Wᵀ of the next deltas, plus the residual path mirroring the forward projection.
			const outGrad = new Float32Array(next.fanIn);
			for (let i = 0; i < outGrad.length; i++) {
				let sum = 0;
				for (let j = 0; j < next.fanOut; j++) {
					sum += nextDeltas[j] * next.weights[j * next.fanIn + i];
				}
				outGrad[i] = sum;
			}
			if (aboveGrad) {
				const count = Math.min(outGrad.length, aboveGrad.length);
				for (let i = 0; i < count; i++) {
					outGrad[i] += aboveGrad[i];
				}
			}
			// f' from f(z), never from the output after the skip term.
			const delta = new Float32Array(outGrad.length);
			for (let i = 0; i < delta.length; i++) {
				delta[i] = outGrad[i] * derivative(fn(zs[i]), zs[i]);
			}
			nextDeltas = clipGradients(delta, config.gradientClipNorm);
			deltas.unshift(nextDeltas);
			aboveGrad = residual ? outGrad : undefined;
		}
		return deltas;
	}

	private _applyGradients(
		context: ForwardContext,
		allDeltas: Float32Array[]
	): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			applyLayerGradients(
				this._deps.layers[layerIdx],
				allDeltas[layerIdx],
				layerInput,
				this._deps
			);
		}
	}

	backprop(context: ForwardContext, target: Float32Array): void {
		const outputDelta = this._computeOutputDelta(context, target);
		const lastLayerIndex = this._deps.layers.length - 1;
		const hiddenDeltas = this._hiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		this._applyGradients(context, [...hiddenDeltas, outputDelta]);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return mseLoss(output, target);
	}
}
