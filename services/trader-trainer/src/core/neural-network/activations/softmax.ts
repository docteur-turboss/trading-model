import type { ActivationDefinition } from "./activation-interface";

/**
 * Softmax is a vector-level operation and cannot be computed on a per-element
 * basis via this interface.  The forward and backward passes handle softmax
 * through dedicated paths in ActivationComputer.applySoftmax() and
 * OutputDeltaComputer, so these methods should never be called directly.
 */
export class SoftmaxActivation implements ActivationDefinition {
	fn(_input: number): number {
		throw new Error(
			"SoftmaxActivation.fn() should not be called directly. " +
				"Softmax is computed across the full output vector via ActivationComputer.applySoftmax()."
		);
	}
	derivative(_activation: number, _preActivation: number): number {
		throw new Error(
			"SoftmaxActivation.derivative() should not be called directly. " +
				"Softmax backpropagation is handled by OutputDeltaComputer."
		);
	}
}
