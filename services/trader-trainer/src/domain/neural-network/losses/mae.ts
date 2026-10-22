import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

export class MeanAbsoluteError extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			sum += Math.abs(target[i] - output[i]);
		}
		return sum / len;
	}

	computeGradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>,
		out: Float32Array,
		invN: number
	): void {
		const len = output.length;
		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			out[i] = (diff > 0 ? 1 : diff < 0 ? -1 : 0) * invN;
		}
	}
}
