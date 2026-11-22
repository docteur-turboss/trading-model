import { ACTIVATIONS } from "@trading-model/model-runtime/neural-network/activation";
import type { NeuralNetworkConfig } from "@trading-model/model-runtime/neural-network/type";
import type { OutputDeltasContext } from "./backprop-engine";
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

export class OutputDeltaComputer {
	constructor(private readonly _config: Required<NeuralNetworkConfig>) {}

	compute(ctx: OutputDeltasContext): Float32Array {
		const { outputZ, output, target, activation } = ctx;
		const lossGrad = mseGradient(output, target);
		const delta = new Float32Array(output.length);
		const { fn, derivative } = ACTIVATIONS[activation];
		for (let j = 0; j < output.length; j++) {
			// `output` may include the DenseSkip residual: derive from the pre-skip value.
			delta[j] = lossGrad[j] * derivative(fn(outputZ[j]), outputZ[j]);
		}
		return clipGradients(delta, this._config.gradientClipNorm);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return mseLoss(output, target);
	}
}
