import type { ActivationDefinition } from "./activation-interface";

export abstract class ElementWiseActivation implements ActivationDefinition {
	abstract fn(input: number): number;
	abstract derivative(activation: number, preActivation: number): number;

	compute(preActivations: Float32Array): Float32Array {
		const output = new Float32Array(preActivations.length);
		for (let i = 0; i < preActivations.length; i++) {
			output[i] = this.fn(preActivations[i]);
		}
		return output;
	}

	outputDelta(
		output: number,
		_target: number,
		lossGradient: number,
		preActivation: number
	): number {
		return lossGradient * this.derivative(output, preActivation);
	}
}
