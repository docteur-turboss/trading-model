import {
	ActivationFn,
	Optimizer as OptimizerType,
} from "@trading-model/validation/adapters/inbound/admin/training.dto";

export { OptimizerType };

export enum LossFunctionType {
	MeanSquaredError = "mean-squared-error",
	CrossEntropy = "cross-entropy",
	MeanBiaisError = "mean-biais-error",
	MeanAbsoluteError = "mean-absolute-error",
	RootMeanSquaredError = "root-mean-squared-error",
	HuberLoss = "huber-loss",
	LogCoshLoss = "log-cosh-loss",
	BinaryCrossEntropy = "binary-cross-entropy",
	HingeLoss = "hinge-loss",
	KullbackLeiblerDivergence = "kullback-leibler",
}

export enum NormalisationType {
	MinMax = "min-max",
	ZScore = "z-score",
	DecimalScaling = "decimal-scaling",
	Border = "border",
	RobustScaling = "robust-scaling",
	LogarithmicNormalization = "logarithmic-normalization",
	None = "none",
}

export enum ActivationType {
	Sigmoid = "sigmoid",
	Tanh = "tanh",
	Relu = "relu",
	LeakyReLu = "leakyReLu",
	Gelu = "gelu",
	Softmax = "softmax",
	Elu = "elu",
	Mish = "mish",
}

export enum ConnectionType {
	FullyConnected = "fully-connected",
	DenseSkip = "dense-skip",
	ResidualConnection = "residual-connection",
}

export enum InitialisationType {
	Zeros = "zeros",
	LeCun = "leCun",
	He = "he",
	Xavier = "xavier",
	Random = "random",
}

export enum ExperienceKind {
	Bare = "bare",
	QLearning = "qlearning",
	Supervised = "supervised",
}

const ACTIVATION_FN_TO_TYPE: Record<ActivationFn, ActivationType | undefined> =
	{
		[ActivationFn.Relu]: ActivationType.Relu,
		[ActivationFn.Sigmoid]: ActivationType.Sigmoid,
		[ActivationFn.Tanh]: ActivationType.Tanh,
		[ActivationFn.Softmax]: ActivationType.Softmax,
		[ActivationFn.Gelu]: ActivationType.Gelu,
		[ActivationFn.Elu]: ActivationType.Elu,
		[ActivationFn.Mish]: ActivationType.Mish,
		[ActivationFn.LeakyRelu]: ActivationType.LeakyReLu,
		[ActivationFn.Linear]: undefined,
	};

export function activationFnToType(
	fn: ActivationFn
): ActivationType | undefined {
	return ACTIVATION_FN_TO_TYPE[fn];
}
