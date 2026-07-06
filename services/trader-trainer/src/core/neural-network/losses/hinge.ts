import type { LossConfig } from "../type";
import { validateLengths } from "./validate-lengths";
import type { LossDefinition } from "./loss-definition";

export class HingeLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;
		let sum = 0;
		for (let i = 0; i < len; i++) {
			const margin = 1 - target[i] * output[i];
			sum += margin > 0 ? margin : 0;
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
			const outVal = output[i];
			const tgt = target[i];
			out[i] = (tgt * outVal < 1 ? -tgt : 0) * invN;
		}
		return out;
	}
}
