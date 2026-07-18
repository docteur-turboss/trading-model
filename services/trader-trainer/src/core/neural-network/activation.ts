import type { ActivationDefinition } from "./activations/activation-interface";
import { ActivationType } from "./type";

export type { ActivationDefinition } from "./activations/activation-interface";

function _geluTanhVal(sqrt2Pi: number, preActivation: number): number {
	return Math.tanh(sqrt2Pi * (preActivation + 0.044715 * preActivation ** 3));
}

function _geluDerivative(
	tanhVal: number,
	preActivation: number,
	sqrt2Pi: number
): number {
	return (
		0.5 * (1 + tanhVal) +
		0.5 *
			preActivation *
			(1 - tanhVal ** 2) *
			sqrt2Pi *
			(1 + 3 * 0.044715 * preActivation ** 2)
	);
}

const Sigmoid: ActivationDefinition = {
	fn: (input) => 1 / (1 + Math.exp(-input)),
	derivative: (activation) => activation * (1 - activation),
};

const Tanh: ActivationDefinition = {
	fn: (input) => Math.tanh(input),
	derivative: (activation) => 1 - activation * activation,
};

const Relu: ActivationDefinition = {
	fn: (input) => Math.max(0, input),
	derivative: (_activation, preActivation) => (preActivation > 0 ? 1 : 0),
};

const LeakyRelu: ActivationDefinition = {
	fn: (input) => (input > 0 ? input : 0.01 * input),
	derivative: (_activation, preActivation) => (preActivation > 0 ? 1 : 0.01),
};

const Elu: ActivationDefinition = {
	fn: (input) => (input >= 0 ? input : 0.01 * (Math.exp(input) - 1)),
	derivative: (_activation, preActivation) =>
		preActivation >= 0 ? 1 : 0.01 * Math.exp(preActivation),
};

const Gelu: ActivationDefinition = {
	fn: (input) => {
		const inner = Math.sqrt(2 / Math.PI) * (input + 0.044715 * input ** 3);
		return 0.5 * input * (1 + Math.tanh(inner));
	},
	derivative: (_activation, preActivation) => {
		const sqrt2Pi = Math.sqrt(2 / Math.PI);
		const tanhVal = _geluTanhVal(sqrt2Pi, preActivation);
		return _geluDerivative(tanhVal, preActivation, sqrt2Pi);
	},
};

const Mish: ActivationDefinition = {
	fn: (input) => input * Math.tanh(Math.log(1 + Math.exp(input))),
	derivative: (_activation, preActivation) => {
		const softplus = Math.log(1 + Math.exp(preActivation));
		const tanhVal = Math.tanh(softplus);
		const sigmoid = Math.exp(preActivation) / (1 + Math.exp(preActivation));
		return tanhVal + preActivation * (1 - tanhVal ** 2) * sigmoid;
	},
};

const Softmax: ActivationDefinition = {
	fn: () => {
		throw new Error(
			"SoftmaxActivation.fn() should not be called directly. " +
				"Softmax is computed across the full output vector via ActivationComputer.applySoftmax()."
		);
	},
	derivative: () => {
		throw new Error(
			"SoftmaxActivation.derivative() should not be called directly. " +
				"Softmax backpropagation is handled by OutputDeltaComputer."
		);
	},
};

export const SIGMOID = Sigmoid;
export const TANH = Tanh;
export const RELU = Relu;
export const LEAKY_RELU = LeakyRelu;
export const ELU = Elu;
export const GELU = Gelu;
export const MISH = Mish;
export const SOFTMAX = Softmax;

export const ACTIVATIONS: Record<ActivationType, ActivationDefinition> = {
	[ActivationType.Sigmoid]: SIGMOID,
	[ActivationType.Tanh]: TANH,
	[ActivationType.Relu]: RELU,
	[ActivationType.LeakyReLu]: LEAKY_RELU,
	[ActivationType.Elu]: ELU,
	[ActivationType.Gelu]: GELU,
	[ActivationType.Mish]: MISH,
	[ActivationType.Softmax]: SOFTMAX,
};
