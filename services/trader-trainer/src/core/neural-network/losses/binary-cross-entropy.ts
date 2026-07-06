import type { LossConfig } from "../type";
import type { LossDefinition } from "./loss-definition";
import { validateLengths } from "./validate-lengths";

const EPSILON = 1e-10;

export class BinaryCrossEntropyLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
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
			out[i] =
				(-tgt / (outVal + EPSILON) + (1 - tgt) / (1 - outVal + EPSILON)) * invN;
		}
		return out;
	}
}
