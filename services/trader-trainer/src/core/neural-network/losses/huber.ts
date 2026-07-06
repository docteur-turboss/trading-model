import type { LossConfig } from "../type";
import type { LossDefinition } from "./loss-definition";
import { validateLengths } from "./validate-lengths";

export class HuberLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number {
		validateLengths(output, target);
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

	gradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);
		const invN = 1 / len;
		const delta = config.deltaHuber;
		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			out[i] = (diff > delta ? delta : diff < -delta ? -delta : diff) * invN;
		}
		return out;
	}
}
