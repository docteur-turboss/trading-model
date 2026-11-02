import type { LossConfig } from "../type";
import type { LossDefinition } from "./loss-definition";
import { validateLengths } from "./validate-lengths";

export abstract class BaseLoss implements LossDefinition {
	abstract computeLoss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number;

	abstract computeGradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>,
		out: Float32Array,
		invN: number
	): void;

	loss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		return this.computeLoss(output, target, config);
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);
		this.computeGradient(output, target, config, out, 1 / len);
		return out;
	}
}
