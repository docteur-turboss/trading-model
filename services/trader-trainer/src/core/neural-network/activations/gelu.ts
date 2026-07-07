import type { ActivationDefinition } from "./activation-interface";

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

export class GeluActivation implements ActivationDefinition {
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
