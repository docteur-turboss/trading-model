import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

export class HingeLoss extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const margin = 1 - target[i] * output[i];
			sum += margin > 0 ? margin : 0;
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
			out[i] = (tgt * outVal < 1 ? -tgt : 0) * invN;
		}
	}
}
