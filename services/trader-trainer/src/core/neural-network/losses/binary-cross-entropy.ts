import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

const EPSILON = 1e-10;

export class BinaryCrossEntropyLoss extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const outVal = output[i];
			const tgt = target[i];
			sum -=
				tgt * Math.log(outVal + EPSILON) +
				(1 - tgt) * Math.log(1 - outVal + EPSILON);
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
			const outVal = output[i];
			const tgt = target[i];
			out[i] =
				(-tgt / (outVal + EPSILON) + (1 - tgt) / (1 - outVal + EPSILON)) * invN;
		}
	}
}
