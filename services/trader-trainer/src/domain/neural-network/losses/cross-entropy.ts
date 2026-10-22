import type { LossConfig } from "../type";
import { EPSILON } from "../utils";
import { BaseLoss } from "./base-loss";

export class CrossEntropyLoss extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const outVal = Math.min(1 - EPSILON, Math.max(EPSILON, output[i]));
			sum -= target[i] * Math.log(outVal);
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
			out[i] = (-target[i] / (output[i] + EPSILON)) * invN;
		}
	}
}
