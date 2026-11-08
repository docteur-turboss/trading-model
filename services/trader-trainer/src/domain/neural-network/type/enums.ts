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
	Elu = "elu",
	Mish = "mish",
	Linear = "linear",
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
	QLearning = "qlearning",
}
