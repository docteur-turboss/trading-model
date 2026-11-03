import type { LossConfig } from "../type";
import { BaseLoss } from "./base-loss";

export class HuberLoss extends BaseLoss {
	computeLoss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number {
		const len = output.length;
		let sum = 0;
		const delta = config.deltaHuber;
		for (let i = 0; i < len; i++) {
			const err = Math.abs(target[i] - output[i]);
			if (err <= delta) {
				sum += 0.5 * err * err;
			} else {
				sum += delta * (err - 0.5 * delta);
			}
		}
		return sum / len;
	}

	computeGradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>,
		out: Float32Array,
		invN: number
	): void {
		const len = output.length;
		const delta = config.deltaHuber;
		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			out[i] = (diff > delta ? delta : diff < -delta ? -delta : diff) * invN;
		}
	}
}
