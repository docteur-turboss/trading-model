import type { LossConfig } from "../type";
import { validateLengths } from "./validate-lengths";
import type { LossDefinition } from "./loss-definition";

export class MeanAbsoluteError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			sum += Math.abs(target[i] - output[i]);
		}
		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);
		const invN = 1 / len;
		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			out[i] = (diff > 0 ? 1 : diff < 0 ? -1 : 0) * invN;
		}
		return out;
	}
}
