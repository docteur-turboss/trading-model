import type { ActivationType } from "./type";

export interface ActivationDefinition {
	fn(input: number): number;
	derivative(activation: number, preActivation: number): number;
}

class SigmoidActivation implements ActivationDefinition {
	fn(input: number): number {
		return 1 / (1 + Math.exp(-input));
	}
	derivative(activation: number): number {
		return activation * (1 - activation);
	}
}

class TanhActivation implements ActivationDefinition {
	fn(input: number): number {
		return Math.tanh(input);
	}
	derivative(activation: number): number {
		return 1 - activation * activation;
	}
}

class ReluActivation implements ActivationDefinition {
	fn(input: number): number {
		return Math.max(0, input);
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation > 0 ? 1 : 0;
	}
}

class LeakyReluActivation implements ActivationDefinition {
	fn(input: number): number {
		return input > 0 ? input : 0.01 * input;
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation > 0 ? 1 : 0.01;
	}
}

class EluActivation implements ActivationDefinition {
	fn(input: number): number {
		return input >= 0 ? input : 0.01 * (Math.exp(input) - 1);
	}
	derivative(_activation: number, preActivation: number): number {
		return preActivation >= 0 ? 1 : 0.01 * Math.exp(preActivation);
	}
}

class GeluActivation implements ActivationDefinition {
	fn(input: number): number {
		const inner = Math.sqrt(2 / Math.PI) * (input + 0.044715 * input ** 3);
		return 0.5 * input * (1 + Math.tanh(inner));
	}
	derivative(_activation: number, preActivation: number): number {
		const sqrt2Pi = Math.sqrt(2 / Math.PI);
		const tanhVal = _geluTanhVal(sqrt2Pi, preActivation);
		return _geluDerivative(tanhVal, preActivation, sqrt2Pi);
	}
}

function _geluTanhVal(sqrt2Pi: number, preActivation: number): number {
	return Math.tanh(sqrt2Pi * (preActivation + 0.044715 * preActivation ** 3));
}

function _geluDerivative(tanhVal: number, preActivation: number, sqrt2Pi: number): number {
	return (
		0.5 * (1 + tanhVal) +
		0.5 * preActivation * (1 - tanhVal ** 2) * sqrt2Pi * (1 + 3 * 0.044715 * preActivation ** 2)
	);
}

class MishActivation implements ActivationDefinition {
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

class SoftmaxActivation implements ActivationDefinition {
	fn(input: number): number {
		return input;
	}
	derivative(): number {
		return 1;
	}
}

export const SIGMOID = new SigmoidActivation();
export const TANH = new TanhActivation();
export const RELU = new ReluActivation();
export const LEAKY_RELU = new LeakyReluActivation();
export const ELU = new EluActivation();
export const GELU = new GeluActivation();
export const MISH = new MishActivation();
export const SOFTMAX = new SoftmaxActivation();

export const ACTIVATIONS: Record<ActivationType, ActivationDefinition> = {
	sigmoid: SIGMOID,
	tanh: TANH,
	relu: RELU,
	leakyReLu: LEAKY_RELU,
	elu: ELU,
	gelu: GELU,
	mish: MISH,
	softmax: SOFTMAX,
};
