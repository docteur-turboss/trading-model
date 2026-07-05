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
		const { beta1, beta2, epsilon } = hp;
		const moment1 = state.moment1!;
		const moment2 = state.moment2!;

		state.stepCount++;
		const step = state.stepCount as number;
		const lrT = (lr * Math.sqrt(1 - beta2 ** step)) / (1 - beta1 ** step);

		for (let i = 0; i < params.length; i++) {
			const grad = grads[i];
			moment1[i] = beta1 * moment1[i] + (1 - beta1) * grad;
			moment2[i] = beta2 * moment2[i] + (1 - beta2) * grad * grad;
			params[i] -= (lrT * moment1[i]) / (Math.sqrt(moment2[i]) + epsilon);
		}
	}
}

class RmspropOptimizer implements Optimizer {
	initState(size: number): OptimizerState {
		return {
			stepCount: 0,
			moment2: new Float32Array(size),
		};
	}

	step(options: RMSPropOptions): void {
		const { params, grads, state, lr, hp } = options;
		const { beta2, epsilon } = hp;
		const moment2 = state.moment2!;

		state.stepCount++;

		for (let i = 0; i < params.length; i++) {
			const grad = grads[i];
			moment2[i] = beta2 * moment2[i] + (1 - beta2) * grad * grad;
			params[i] -= (lr / (Math.sqrt(moment2[i]) + epsilon)) * grad;
		}
	}
}

export const SGD = new SgdOptimizer();
export const ADAM = new AdamOptimizer();
export const RMSPROP = new RmspropOptimizer();

export const OPTIMIZERS: Record<OptimizerType, Optimizer> = {
	sgd: SGD,
	adam: ADAM,
	rmsprop: RMSPROP,
};
