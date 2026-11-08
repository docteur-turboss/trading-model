export type {
	LossConfig,
	NetworkArchitecture,
	NeuralNetworkConfig,
} from "./type/config";
export { mergeConfig } from "./type/config";
export {
	ActivationType,
	ConnectionType,
	ExperienceKind,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "./type/enums";
export type {
	Experience,
	ForwardContext,
	LayerMemory,
	LayerWeights,
	QLearningExperience,
} from "./type/experience";
