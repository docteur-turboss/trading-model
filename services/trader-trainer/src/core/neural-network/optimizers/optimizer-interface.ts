export interface OptimizerHyperparams {
	beta1: number;
	beta2: number;
	epsilon: number;
}

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

export interface OptimizerStepOptions<
	TState extends OptimizerState = OptimizerState,
> {
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
