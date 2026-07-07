import { OptimizerType } from "./type";

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

export interface SgdState {
	stepCount: number;
}

export interface AdamState {
	stepCount: number;
	moment1: Float32Array;
	moment2: Float32Array;
}

export interface RmspropState {
	stepCount: number;
	moment2: Float32Array;
}

export type OptimizerState = SgdState | AdamState | RmspropState;

export interface OptimizerStepOptions<TState extends OptimizerState = OptimizerState> {
	params: Float32Array;
	grads: Float32Array;
	state: TState;
	lr: number;
	hp: OptimizerHyperparams;
}

export interface Optimizer {
	initState(size: number): OptimizerState;
	step(options: OptimizerStepOptions): void;
}

class SgdOptimizer implements Optimizer {
	initState(_size: number): SgdState {
		return { stepCount: 0 };
	}

	step(options: OptimizerStepOptions<SgdState>): void {
		const { params, grads, state, lr } = options;
		state.stepCount++;
		for (let i = 0; i < params.length; i++) {
			params[i] -= lr * grads[i];
		}
	}
}

class AdamOptimizer implements Optimizer {
	initState(size: number): AdamState {
		return {
			stepCount: 0,
			moment1: new Float32Array(size),
			moment2: new Float32Array(size),
		};
	}

	step(options: OptimizerStepOptions<AdamState>): void {
		const { params, grads, state, lr, hp } = options;
		state.stepCount++;
		const stepT = state.stepCount;
		const lrT =
			(lr * Math.sqrt(1 - hp.beta2 ** stepT)) / (1 - hp.beta1 ** stepT);

		for (let i = 0; i < params.length; i++) {
			const grad = grads[i];
			state.moment1[i] = hp.beta1 * state.moment1[i] + (1 - hp.beta1) * grad;
			state.moment2[i] =
				hp.beta2 * state.moment2[i] + (1 - hp.beta2) * grad * grad;
			params[i] -=
				(lrT * state.moment1[i]) / (Math.sqrt(state.moment2[i]) + hp.epsilon);
		}
	}
}

class RmspropOptimizer implements Optimizer {
	initState(size: number): RmspropState {
		return { stepCount: 0, moment2: new Float32Array(size) };
	}

	step(options: OptimizerStepOptions<RmspropState>): void {
		const { params, grads, state, lr, hp } = options;
		state.stepCount++;
		for (let i = 0; i < params.length; i++) {
			const grad = grads[i];
			state.moment2[i] =
				hp.beta2 * state.moment2[i] + (1 - hp.beta2) * grad * grad;
			params[i] -= (lr / (Math.sqrt(state.moment2[i]) + hp.epsilon)) * grad;
		}
	}
}

export const SGD = new SgdOptimizer();
export const ADAM = new AdamOptimizer();
export const RMSPROP = new RmspropOptimizer();

export const OPTIMIZERS: Record<OptimizerType, Optimizer> = {
	[OptimizerType.Sgd]: SGD,
	[OptimizerType.Adam]: ADAM,
	[OptimizerType.Adamw]: ADAM,
	[OptimizerType.Rmsprop]: RMSPROP,
};
