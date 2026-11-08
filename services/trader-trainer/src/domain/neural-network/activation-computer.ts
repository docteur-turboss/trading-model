import { ACTIVATIONS } from "./activation";
import type { ActivationType } from "./type";

export class ActivationComputer {
	applyElementWiseActivation(
		preActivations: Float32Array,
		activation: ActivationType
	): Float32Array {
		const fanOut = preActivations.length;
		const output = new Float32Array(fanOut);
		for (let i = 0; i < fanOut; i++) {
			output[i] = this.activate(preActivations[i], activation);
		}
		return output;
	}

	activate(input: number, activation: ActivationType): number {
		return ACTIVATIONS[activation].fn(input);
	}
}
