export type {
	LossConfig,
	MutationConfig,
	NetworkArchitecture,
	NetworkInitConfig,
	NeuralNetworkConfig,
	NeuronsByLayer,
	OptimizerConfig,
} from "./type/config";
export { mergeConfig } from "./type/config";
export {
	ActivationType,
	activationFnToType,
	ConnectionType,
	ExperienceKind,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "./type/enums";
export type {
	BareExperience,
	Experience,
	ForwardContext,
	LayerActivation,
	LayerActivations,
	LayerDimensions,
	LayerGradients,
	LayerMemory,
	LayerWeights,
	PooledExperience,
	QLearningExperience,
	SupervisedExperience,
} from "./type/experience";
