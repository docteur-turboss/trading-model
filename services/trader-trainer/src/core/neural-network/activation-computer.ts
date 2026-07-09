import { ACTIVATIONS } from "./activation";
import type { ActivationType } from "./type";

export class ActivationComputer {
	findMax(preActivations: Float32Array): number {
		let max = preActivations[0];
		for (let i = 1; i < preActivations.length; i++) {
			if (preActivations[i] > max) {
				max = preActivations[i];
			}
		}
		return max;
	}

	computeExpSum(
		preActivations: Float32Array,
		max: number
	): { output: Float32Array; expSum: number } {
		const output = new Float32Array(preActivations.length);
		let expSum = 0;
		for (let i = 0; i < preActivations.length; i++) {
			const expVal = Math.exp(preActivations[i] - max);
			output[i] = expVal;
			expSum += expVal;
		}
		return { output, expSum };
	}

	applySoftmax(preActivations: Float32Array): Float32Array {
		const max = this.findMax(preActivations);
		const { output, expSum } = this.computeExpSum(preActivations, max);
		const inv = 1 / expSum;
		for (let i = 0; i < output.length; i++) {
			output[i] *= inv;
		}
		return output;
	}

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
