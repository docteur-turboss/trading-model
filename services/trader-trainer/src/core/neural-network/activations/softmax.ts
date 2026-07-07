import type { ActivationDefinition } from "./activation-interface";

export class SoftmaxActivation implements ActivationDefinition {
	fn(input: number): number {
		return input;
	}
	derivative(): number {
		return 1;
	}
}
