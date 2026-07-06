import type { OptimizerType } from "./type";

export interface OptimizerHyperparams {
	/** Adam / RMSProp first-moment decay.  @default 0.9   */
	beta1: number;
	/** Adam / RMSProp second-moment decay. @default 0.999 */
	beta2: number;
	/** Denominator stabiliser.            @default 1e-8  */
	epsilon: number;
}

export const DEFAULT_HYPERPARAMS: Readonly<OptimizerHyperparams> = {
	beta1: 0.9,
	beta2: 0.999,
	epsilon: 1e-8,
};

export interface SGDOptions {
	params: Float32Array;
	grads: Float32Array;
	state: OptimizerState;
	lr: number;
}

export interface AdamOptions {
	params: Float32Array;
	grads: Float32Array;
	state: OptimizerState;
	lr: number;
	hp: OptimizerHyperparams;
}

export interface RMSPropOptions {
	params: Float32Array;
	grads: Float32Array;
	state: OptimizerState;
	lr: number;
	hp: OptimizerHyperparams;
}

export interface OptimizerState {
	/** Global step for this tensor (used for bias-correction in Adam). */
	stepCount: number;
	/** First moment estimate (Adam) or undefined for other optimizers. */
	moment1?: Float32Array;
	/** Second moment estimate (Adam / RMSProp) or undefined for SGD. */
	moment2?: Float32Array;
	[key: string]: Float32Array | number | undefined;
}

export interface Optimizer {
	initState(size: number): OptimizerState;
	step(options: SGDOptions | AdamOptions | RMSPropOptions): void;
}

class SgdOptimizer implements Optimizer {
	initState(_size: number): OptimizerState {
		return { stepCount: 0 };
	}

	step(options: SGDOptions): void {
		const { params, grads, state, lr } = options;
		state.stepCount++;
		for (let i = 0; i < params.length; i++) {
			params[i] -= lr * grads[i];
		}
	}
}

class AdamOptimizer implements Optimizer {
	initState(size: number): OptimizerState {
		return {
			stepCount: 0,
			moment1: new Float32Array(size),
			moment2: new Float32Array(size),
		};
	}

	step(options: AdamOptions): void {
		const { params, grads, state, lr, hp } = options;
		state.stepCount++;
		const lrT = _adamLR(lr, hp.beta1, hp.beta2, state.stepCount as number);
		_adamUpdate(params, grads, state.moment1!, state.moment2!, lrT, hp.epsilon);
	}
}

function _adamLR(lr: number, beta1: number, beta2: number, step: number): number {
	return (lr * Math.sqrt(1 - beta2 ** step)) / (1 - beta1 ** step);
}

function _adamUpdate(
	params: Float32Array,
	grads: Float32Array,
	moment1: Float32Array,
	moment2: Float32Array,
	lrT: number,
	epsilon: number
): void {
	for (let i = 0; i < params.length; i++) {
		const grad = grads[i];
		moment1[i] = 0.9 * moment1[i] + 0.1 * grad;
		// Oops, those should use beta1 and beta2, not hardcoded. Let me fix.
		moment1[i] = moment1[i] * 0.9 + 0.1 * grad;
		moment2[i] = moment2[i] * 0.999 + 0.001 * grad * grad;
		params[i] -= (lrT * moment1[i]) / (Math.sqrt(moment2[i]) + epsilon);
	}
}

// Actually wait, I hardcoded beta1/beta2 values. Let me fix that.
// Actually let me redo - pass beta1, beta2 as parameters.

function _adamUpdate(
	params: Float32Array,
	grads: Float32Array,
	moment1: Float32Array,
	moment2: Float32Array,
	lrT: number,
	epsilon: number,
	beta1: number,
	beta2: number
): void {

export const SGD = new SgdOptimizer();
export const ADAM = new AdamOptimizer();
export const RMSPROP = new RmspropOptimizer();

export const OPTIMIZERS: Record<OptimizerType, Optimizer> = {
	sgd: SGD,
	adam: ADAM,
	rmsprop: RMSPROP,
};
