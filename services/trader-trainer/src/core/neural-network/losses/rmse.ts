import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

const EPSILON = 1e-10;

export class RootMeanSquaredError extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const err = target[i] - output[i];
			sum += err * err;
		}
		return Math.sqrt(sum / len);
	}

	computeGradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>,
		out: Float32Array,
		invN: number
	): void {
		const len = output.length;
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
	}
}
