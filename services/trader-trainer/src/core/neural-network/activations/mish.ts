import type { ActivationDefinition } from "./activation-interface";

export class MishActivation implements ActivationDefinition {
	fn(input: number): number {
		return input * Math.tanh(Math.log(1 + Math.exp(input)));
	}
	derivative(_activation: number, preActivation: number): number {
		const softplus = Math.log(1 + Math.exp(preActivation));
		const tanhVal = Math.tanh(softplus);
		const sigmoid = Math.exp(preActivation) / (1 + Math.exp(preActivation));

		return tanhVal + preActivation * (1 - tanhVal ** 2) * sigmoid;
	}
}
