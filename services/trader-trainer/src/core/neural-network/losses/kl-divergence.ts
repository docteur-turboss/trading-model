import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

const EPSILON = 1e-10;

export class KLDivergenceLoss extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const tgt = target[i];
			sum += tgt * Math.log((tgt + EPSILON) / (output[i] + EPSILON));
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
