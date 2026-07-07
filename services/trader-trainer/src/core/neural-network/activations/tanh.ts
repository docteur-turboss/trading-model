import type { ActivationDefinition } from "./activation-interface";

export class TanhActivation implements ActivationDefinition {
	fn(input: number): number {
		return Math.tanh(input);
	}
	derivative(activation: number): number {
		return 1 - activation * activation;
	}
}
