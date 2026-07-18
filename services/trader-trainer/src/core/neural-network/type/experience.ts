import type {
	PositiveInt,
	Reward,
} from "@trading-model/common/domain/primitives";
import type { OptimizerState } from "../optimizer";
import type { ExperienceKind } from "./enums";

interface ExperienceBase {
	input: Float32Array;
	output: Float32Array;
}

export interface BareExperience extends ExperienceBase {
	kind: ExperienceKind.Bare;
}

export interface QLearningExperience extends ExperienceBase {
	kind: ExperienceKind.QLearning;
	reward: Reward;
	nextState: Float32Array;
	done: boolean;
}

export interface SupervisedExperience extends ExperienceBase {
	kind: ExperienceKind.Supervised;
	target: Float32Array;
}

export type Experience =
	| BareExperience
	| QLearningExperience
	| SupervisedExperience;

export interface ForwardContext {
	input: Float32Array;
	output: Float32Array;
	layerZValues: Float32Array[];
	layerOutputs: Float32Array[];
}

export interface LayerActivation {
	output: Float32Array;
	preActivation: Float32Array;
	zValues: Float32Array;
}

export interface PooledExperience extends SupervisedExperience {
	layerActivations: LayerActivation[];
	loss: number;
}

export interface LayerWeights {
	weights: Float32Array;
	bias: Float32Array;
}

export interface LayerDimensions {
	fanIn: PositiveInt;
	fanOut: PositiveInt;
}

export interface LayerActivations {
	output: Float32Array;
	preActivation: Float32Array;
}

export interface LayerGradients {
	delta: Float32Array;
	gradW: Float32Array;
	gradB: Float32Array;
	accumGradW: Float32Array;
	accumGradB: Float32Array;
}

export interface LayerMemory
	extends LayerWeights,
		LayerDimensions,
		LayerActivations,
		LayerGradients {
	wState: OptimizerState;
	bState: OptimizerState;
}
