import { ActivationType } from "./type";

interface ActivationDefinition {
	fn(input: number): number;
	derivative(activation: number, preActivation: number): number;
}

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
	fn: (input) =>
		0.5 * input * (1 + _geluTanhVal(Math.sqrt(2 / Math.PI), input)),
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

const Linear: ActivationDefinition = {
	fn: (input) => input,
	derivative: () => 1,
};

export const ACTIVATIONS: Record<ActivationType, ActivationDefinition> = {
	[ActivationType.Sigmoid]: Sigmoid,
	[ActivationType.Tanh]: Tanh,
	[ActivationType.Relu]: Relu,
	[ActivationType.LeakyReLu]: LeakyRelu,
	[ActivationType.Elu]: Elu,
	[ActivationType.Gelu]: Gelu,
	[ActivationType.Mish]: Mish,
	[ActivationType.Linear]: Linear,
};
