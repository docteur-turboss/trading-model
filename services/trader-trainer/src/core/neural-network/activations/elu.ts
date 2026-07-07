import type { ActivationDefinition } from "./activation-interface";

export class EluActivation implements ActivationDefinition {
	fn(input: number): number {
		return input >= 0 ? input : 0.01 * (Math.exp(input) - 1);
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation >= 0 ? 1 : 0.01 * Math.exp(preActivation);
	}
}
