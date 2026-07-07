import type { ActivationDefinition } from "./activation-interface";

export class ReluActivation implements ActivationDefinition {
	fn(input: number): number {
		return Math.max(0, input);
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation > 0 ? 1 : 0;
	}
}
