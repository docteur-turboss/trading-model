import type { LossConfig } from "../type";
import { EPSILON } from "../utils";
import { BaseLoss } from "./base-loss";
import { sumSquaredErrors } from "./squared-error";

export class RootMeanSquaredError extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		return Math.sqrt(sumSquaredErrors(output, target) / output.length);
	}

	computeGradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>,
		out: Float32Array,
		invN: number
	): void {
		const len = output.length;
		const sum = sumSquaredErrors(output, target);
		const rmse = Math.sqrt(sum * invN) + EPSILON;
		const scale = invN / rmse;
		for (let i = 0; i < len; i++) {
			out[i] = (output[i] - target[i]) * scale;
		}
	}
}
