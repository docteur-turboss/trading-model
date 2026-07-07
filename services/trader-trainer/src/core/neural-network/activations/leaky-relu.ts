import type { ActivationDefinition } from "./activation-interface";

export class LeakyReluActivation implements ActivationDefinition {
	fn(input: number): number {
		return input > 0 ? input : 0.01 * input;
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation > 0 ? 1 : 0.01;
	}
}
