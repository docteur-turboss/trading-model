import type { LossConfig } from "../type";
import { validateLengths } from "./validate-lengths";
import type { LossDefinition } from "./loss-definition";

const EPSILON = 1e-10;

export class RootMeanSquaredError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const err = target[i] - output[i];
			sum += err * err;
		}
		return Math.sqrt(sum / len);
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);
		const invN = 1 / len;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			sum += diff * diff;
		}
		const rmse = Math.sqrt(sum * invN) + EPSILON;
		const scale = invN / rmse;
		for (let i = 0; i < len; i++) {
			out[i] = (output[i] - target[i]) * scale;
		}
		return out;
	}
}
