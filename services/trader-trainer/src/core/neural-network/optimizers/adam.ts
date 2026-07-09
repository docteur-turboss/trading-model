import type {
	AdamState,
	Optimizer,
	OptimizerStepOptions,
} from "./optimizer-interface";

export class AdamOptimizer implements Optimizer {
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
