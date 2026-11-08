import type { PositiveInt, Reward } from "@trading-model/primitives/primitives";
import type { OptimizerState } from "../optimizer";
import type { ExperienceKind } from "./enums";

interface ExperienceBase {
	input: Float32Array;
	output: Float32Array;
}

export interface QLearningExperience extends ExperienceBase {
	kind: ExperienceKind.QLearning;
	reward: Reward;
	nextState: Float32Array;
	done: boolean;
	/** Index of the output unit the policy acted on (not necessarily the argmax). */
	action: number;
}

export type Experience = QLearningExperience;

export interface ForwardContext {
	input: Float32Array;
	output: Float32Array;
	layerZValues: Float32Array[];
	layerOutputs: Float32Array[];
}

export interface LayerWeights {
	weights: Float32Array;
	bias: Float32Array;
}

interface LayerDimensions {
	fanIn: PositiveInt;
	fanOut: PositiveInt;
}

interface LayerActivations {
	output: Float32Array;
	preActivation: Float32Array;
}

interface LayerGradients {
	delta: Float32Array;
	gradW: Float32Array;
	gradB: Float32Array;
}

export interface LayerMemory
	extends LayerWeights,
		LayerDimensions,
		LayerActivations,
		LayerGradients {
	wState: OptimizerState;
	bState: OptimizerState;
}
