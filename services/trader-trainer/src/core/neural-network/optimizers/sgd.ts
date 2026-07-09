import type {
	Optimizer,
	OptimizerStepOptions,
	SgdState,
} from "./optimizer-interface";

export class SgdOptimizer implements Optimizer {
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
