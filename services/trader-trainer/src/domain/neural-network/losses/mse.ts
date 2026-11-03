import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";
import { sumSquaredErrors } from "./squared-error";

export class MeanSquaredError extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		return sumSquaredErrors(output, target) / output.length;
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
			out[i] = 2 * diff * invN;
		}
	}
}
