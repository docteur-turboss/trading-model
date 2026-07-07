import type { ActivationDefinition } from "./activation-interface";

export class SigmoidActivation implements ActivationDefinition {
	fn(input: number): number {
		return 1 / (1 + Math.exp(-input));
	}
	derivative(activation: number): number {
		return activation * (1 - activation);
	}
}
