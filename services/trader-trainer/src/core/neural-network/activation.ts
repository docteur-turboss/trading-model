import type { ActivationType } from "./type";

export interface ActivationDefinition {
	fn(input: number): number;
	derivative(activation: number, preActivation: number): number;
}

export const ACTIVATIONS: Record<ActivationType, ActivationDefinition> = {
	sigmoid: {
		fn: (input) => 1 / (1 + Math.exp(-input)),
		derivative: (activation) => activation * (1 - activation),
	},

	tanh: {
		fn: (input) => Math.tanh(input),
		derivative: (activation) => 1 - activation * activation,
	},

	relu: {
		fn: (input) => Math.max(0, input),
		derivative: (_unused, preActivation) => (preActivation > 0 ? 1 : 0),
	},

	leakyReLu: {
		fn: (input) => (input > 0 ? input : 0.01 * input),
		derivative: (_unused, preActivation) => (preActivation > 0 ? 1 : 0.01),
	},

	elu: {
		fn: (input) => (input >= 0 ? input : 0.01 * (Math.exp(input) - 1)),
		derivative: (_unused, preActivation) =>
			preActivation >= 0 ? 1 : 0.01 * Math.exp(preActivation),
	},

	gelu: {
		fn: (input) => {
			const inner = Math.sqrt(2 / Math.PI) * (input + 0.044715 * input ** 3);
			return 0.5 * input * (1 + Math.tanh(inner));
		},

		derivative: (_unused, preActivation) => {
			const sqrt2Pi = Math.sqrt(2 / Math.PI);
			const tanhVal = Math.tanh(
				sqrt2Pi * (preActivation + 0.044715 * preActivation ** 3)
			);

			return (
				0.5 * (1 + tanhVal) +
				0.5 *
					preActivation *
					(1 - tanhVal ** 2) *
					sqrt2Pi *
					(1 + 3 * 0.044715 * preActivation ** 2)
			);
		},
	},

	mish: {
		fn: (input) => input * Math.tanh(Math.log(1 + Math.exp(input))),

		derivative: (_unused, preActivation) => {
			const softplus = Math.log(1 + Math.exp(preActivation));
			const tanhVal = Math.tanh(softplus);
			const sigmoid = Math.exp(preActivation) / (1 + Math.exp(preActivation));

			return tanhVal + preActivation * (1 - tanhVal ** 2) * sigmoid;
		},
	},

	softmax: {
		fn: (input) => input,
		derivative: () => 1,
	},
};
