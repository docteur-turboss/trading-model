import type {
	Optimizer,
	OptimizerStepOptions,
	RmspropState,
} from "./optimizer-interface";

export class RmspropOptimizer implements Optimizer {
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
