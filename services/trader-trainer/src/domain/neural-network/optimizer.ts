import { AdamOptimizer } from "./optimizers/adam";
import { RmspropOptimizer } from "./optimizers/rmsprop";
import { SgdOptimizer } from "./optimizers/sgd";
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

export const OPTIMIZERS: Record<OptimizerType, Optimizer> = {
	[OptimizerType.Sgd]: new SgdOptimizer(),
	[OptimizerType.Adam]: new AdamOptimizer(),
	[OptimizerType.Adamw]: new AdamOptimizer(),
	[OptimizerType.Rmsprop]: new RmspropOptimizer(),
};
