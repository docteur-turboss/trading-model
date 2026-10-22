import type { LossConfig } from "../type";

export interface LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number;

	gradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): Float32Array;
}
