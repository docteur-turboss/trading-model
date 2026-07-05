import type {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";
import type {
	ContinuousPolicyGenome,
	CrossoverGenome,
	DiscretePolicyGenome,
	GAControlGenome,
	Genome,
	HorizonGenome,
	LayerGenome,
	MutationGenome,
	NetworkGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
	ValidationError,
	ValidationResult,
} from "./genome";
import { clamp } from "./utils";

const VALID_ACTIVATIONS = new Set<ActivationType>([
	"relu",
	"sigmoid",
	"tanh",
	"leakyReLu",
	"elu",
	"mish",
	"gelu",
	"softmax",
]);
const VALID_CONNECTION_TYPES = new Set<ConnectionType>([
	"dense-skip",
	"fully-connected",
	"residual-connection",
]);
const VALID_BIAS_TYPES = new Set<InitialisationType>([
	"zeros",
	"random",
	"xavier",
	"he",
	"leCun",
]);
const VALID_NORM_TYPES = new Set<NormalisationType>([
	"none",
	"logarithmic-normalization",
	"decimal-scaling",
	"border",
	"min-max",
	"robust-scaling",
	"z-score",
]);

function err(
	errors: ValidationError[],
	path: string,
	message: string,
	actual: unknown
): void {
	errors.push({ path, message, actual });
}

function checkRange(
	errors: ValidationError[],
	path: string,
	value: unknown,
	lo: number,
	hi: number
): void {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < lo ||
		value > hi
	) {
		err(errors, path, `must be a finite number in [${lo}, ${hi}]`, value);
	}
}

function checkPositiveInt(
	errors: ValidationError[],
	path: string,
	value: unknown,
	min = 1
): void {
	if (!Number.isInteger(value) || (value as number) < min) {
		err(errors, path, `must be an integer ≥ ${min}`, value);
	}
}

function validateLayer(
	errors: ValidationError[],
	path: string,
	layer: LayerGenome
): void {
	checkPositiveInt(errors, `${path}.neurons`, layer.neurons);
	if (!VALID_ACTIVATIONS.has(layer.activation)) {
		err(
			errors,
			`${path}.activation`,
			"unknown activation type",
			layer.activation
		);
	}
	if (!VALID_CONNECTION_TYPES.has(layer.connectionType)) {
		err(
			errors,
			`${path}.connectionType`,
			"unknown connection type",
			layer.connectionType
		);
	}
	if (!VALID_BIAS_TYPES.has(layer.biasType)) {
		err(errors, `${path}.biasType`, "unknown bias type", layer.biasType);
	}
}

function repairLayer(layer: LayerGenome): LayerGenome {
	return {
		neurons: Math.max(1, Math.round(layer.neurons ?? 32)),
		activation: VALID_ACTIVATIONS.has(layer.activation)
			? layer.activation
			: "relu",
		connectionType: VALID_CONNECTION_TYPES.has(layer.connectionType)
			? layer.connectionType
			: "dense-skip",
		biasType: VALID_BIAS_TYPES.has(layer.biasType) ? layer.biasType : "zeros",
	};
}

function validateIdentity(errors: ValidationError[], genome: Genome): void {
	if (typeof genome.id !== "string" || genome.id.length === 0) {
		err(errors, "id", "must be a non-empty string", genome.id);
	}
	if (!Number.isInteger(genome.generation) || genome.generation < 0) {
		err(
			errors,
			"generation",
			"must be a non-negative integer",
			genome.generation
		);
	}
}

function validateNetwork(
	errors: ValidationError[],
	network: NetworkGenome
): void {
	checkPositiveInt(errors, "network.inputDim", network.inputDim);
	checkPositiveInt(errors, "network.outputDim", network.outputDim);
	if (
		!Array.isArray(network.hiddenLayers) ||
		network.hiddenLayers.length === 0
	) {
		err(
			errors,
			"network.hiddenLayers",
			"must be a non-empty array",
			network.hiddenLayers
		);
	} else {
		network.hiddenLayers.forEach((layer, index) => {
			validateLayer(errors, `network.hiddenLayers[${index}]`, layer);
		});
	}
	if (!VALID_NORM_TYPES.has(network.normalization)) {
		err(
			errors,
			"network.normalization",
			"unknown normalization type",
			network.normalization
		);
	}
}

function validateRL(errors: ValidationError[], rl: RLGenome): void {
	checkRange(errors, "rl.gamma", rl.gamma, 0.8, 0.9999);
	checkRange(errors, "rl.learningRate", rl.learningRate, 1e-6, 1e-1);
	validateRewardShaping(errors, rl.rewardShaping);
	validateHorizon(errors, rl.horizon);
	validateDiscretePolicy(errors, rl.discretePolicy);
	validateContinuousPolicy(errors, rl.continuousPolicy);
	validateReplayBuffer(errors, rl.replayBuffer);
}

function validateRewardShaping(
	errors: ValidationError[],
	rs: RewardShapingGenome
): void {
	if (rs.clipMin >= rs.clipMax) {
		err(errors, "rl.rewardShapingenome.clip", "clipMin must be < clipMax", {
			clipMin: rs.clipMin,
			clipMax: rs.clipMax,
		});
	}
	checkRange(
		errors,
		"rl.rewardShapingenome.scaleFactor",
		rs.scaleFactor,
		0.001,
		1000
	);
}

function validateHorizon(
	errors: ValidationError[],
	horizon: HorizonGenome
): void {
	checkPositiveInt(
		errors,
		"rl.horizon.maxEpisodeLength",
		horizon.maxEpisodeLength,
		10
	);
	checkPositiveInt(errors, "rl.horizon.nStepReturn", horizon.nStepReturn);
	checkPositiveInt(errors, "rl.horizon.frameSkip", horizon.frameSkip);
}

function validateDiscretePolicy(
	errors: ValidationError[],
	dp: DiscretePolicyGenome
): void {
	checkRange(
		errors,
		"rl.discretePolicy.epsilonStart",
		dp.epsilonStart,
		0.1,
		1.0
	);
	checkRange(errors, "rl.discretePolicy.epsilonMin", dp.epsilonMin, 0.001, 0.2);
	checkRange(
		errors,
		"rl.discretePolicy.epsilonDecay",
		dp.epsilonDecay,
		0.9,
		0.9999
	);
	checkRange(
		errors,
		"rl.discretePolicy.temperature",
		dp.temperature,
		0.01,
		100
	);
}

function validateContinuousPolicy(
	errors: ValidationError[],
	cp: ContinuousPolicyGenome
): void {
	if (cp.clipMin >= cp.clipMax) {
		err(errors, "rl.continuousPolicy.clip", "clipMin must be < clipMax", {
			clipMin: cp.clipMin,
			clipMax: cp.clipMax,
		});
	}
	checkRange(errors, "rl.continuousPolicy.noiseStd", cp.noiseStd, 0.001, 5);
	checkRange(
		errors,
		"rl.continuousPolicy.noiseDecay",
		cp.noiseDecay,
		0.9,
		0.9999
	);
}

function validateReplayBuffer(
	errors: ValidationError[],
	rb: ReplayBufferGenome
): void {
	checkPositiveInt(errors, "rl.replayBuffer.bufferSize", rb.bufferSize, 100);
	checkRange(errors, "rl.replayBuffer.alphaPER", rb.alphaPER, 0, 1);
	checkRange(errors, "rl.replayBuffer.betaPER", rb.betaPER, 0, 1);
}

function validateMutation(
	errors: ValidationError[],
	mutation: MutationGenome
): void {
	checkRange(errors, "mutation.rate", mutation.rate, 0.001, 0.5);
	checkRange(errors, "mutation.sigma", mutation.sigma, 1e-5, 10);
	checkRange(errors, "mutation.selfSigma", mutation.selfSigma, 1e-5, 10);
}

function validateCrossover(
	errors: ValidationError[],
	crossover: CrossoverGenome
): void {
	checkRange(errors, "crossover.probability", crossover.probability, 0, 1);
	checkRange(errors, "crossover.blendAlpha", crossover.blendAlpha, 0, 1);
	checkRange(errors, "crossover.sbxEta", crossover.sbxEta, 1, 100);
}

function validateGAControl(
	errors: ValidationError[],
	ga: GAControlGenome
): void {
	checkPositiveInt(errors, "gaControl.populationSize", ga.populationSize, 2);
	checkRange(errors, "gaControl.elitismFraction", ga.elitismFraction, 0, 1);
	checkRange(errors, "gaControl.survivorFraction", ga.survivorFraction, 0, 1);
	checkPositiveInt(errors, "gaControl.maxGenerations", ga.maxGenerations);
	checkPositiveInt(
		errors,
		"gaControl.episodesPerIndividual",
		ga.episodesPerIndividual
	);
}

export function validateGenome(genome: Genome): ValidationResult {
	const errors: ValidationError[] = [];
	validateIdentity(errors, genome);
	validateNetwork(errors, genome.network);
	validateRL(errors, genome.rl);
	validateMutation(errors, genome.mutation);
	validateCrossover(errors, genome.crossover);
	validateGAControl(errors, genome.gaControl);
	return { valid: errors.length === 0, errors };
}

function repairNetwork(network: NetworkGenome): NetworkGenome {
	let hiddenLayers: LayerGenome[] = (
		Array.isArray(network.hiddenLayers) ? network.hiddenLayers : []
	).map((layer) => repairLayer(layer));

	if (hiddenLayers.length === 0) {
		hiddenLayers = [
			{
				neurons: 32,
				activation: "relu",
				connectionType: "dense-skip",
				biasType: "zeros",
			},
		];
	}

	return {
		inputDim: Math.max(1, Math.round(network.inputDim ?? 1)),
		outputDim: Math.max(1, Math.round(network.outputDim ?? 1)),
		hiddenLayers,
		normalization: VALID_NORM_TYPES.has(network.normalization)
			? network.normalization
			: "none",
	};
}

function repairRewardShaping(rs: RewardShapingGenome): RewardShapingGenome {
	const rawClipMin = rs.clipMin ?? -1;
	const rawClipMax = rs.clipMax ?? 1;
	return {
		clip: rs.clip,
		clipMin: Math.min(rawClipMin, rawClipMax - 1e-6),
		clipMax: Math.max(rawClipMax, rawClipMin + 1e-6),
		scale: rs.scale,
		scaleFactor: Math.max(0.001, rs.scaleFactor ?? 1),
		normalize: rs.normalize,
		sparse: rs.sparse,
	};
}

function repairHorizon(horizon: HorizonGenome): HorizonGenome {
	return {
		maxEpisodeLength: Math.max(10, Math.round(horizon.maxEpisodeLength ?? 500)),
		nStepReturn: Math.max(1, Math.round(horizon.nStepReturn ?? 1)),
		frameSkip: Math.max(1, Math.round(horizon.frameSkip ?? 1)),
	};
}

function repairDiscretePolicy(dp: DiscretePolicyGenome): DiscretePolicyGenome {
	return {
		type: dp.type ?? "epsilon_greedy",
		epsilonStart: clamp(dp.epsilonStart ?? 1.0, 0.1, 1.0),
		epsilonMin: clamp(dp.epsilonMin ?? 0.05, 0.001, 0.2),
		epsilonDecay: clamp(dp.epsilonDecay ?? 0.995, 0.9, 0.9999),
		temperature: Math.max(0.01, dp.temperature ?? 1.0),
	};
}

function repairContinuousPolicy(
	cp: ContinuousPolicyGenome
): ContinuousPolicyGenome {
	const cpClipMin = Math.min(cp.clipMin ?? -1, (cp.clipMax ?? 1) - 1e-6);
	const cpClipMax = Math.max(cp.clipMax ?? 1, (cp.clipMin ?? -1) + 1e-6);
	return {
		type: cp.type ?? "tanh_squashing",
		clipMin: cpClipMin,
		clipMax: cpClipMax,
		noiseStd: Math.max(0.001, cp.noiseStd ?? 0.1),
		noiseDecay: clamp(cp.noiseDecay ?? 0.999, 0.9, 0.9999),
	};
}

function repairReplayBuffer(rb: ReplayBufferGenome): ReplayBufferGenome {
	return {
		bufferSize: Math.max(100, Math.round(rb.bufferSize ?? 10_000)),
		prioritized: rb.prioritized,
		alphaPER: clamp(rb.alphaPER ?? 0.6, 0, 1),
		betaPER: clamp(rb.betaPER ?? 0.4, 0, 1),
		betaAnneal: rb.betaAnneal,
	};
}

function repairRL(rl: RLGenome): typeof rl {
	return {
		gamma: clamp(rl.gamma ?? 0.99, 0.8, 0.9999),
		learningRate: clamp(rl.learningRate ?? 1e-3, 1e-6, 1e-1),
		rewardShaping: repairRewardShaping(rl.rewardShaping),
		horizon: repairHorizon(rl.horizon),
		discretePolicy: repairDiscretePolicy(rl.discretePolicy),
		continuousPolicy: repairContinuousPolicy(rl.continuousPolicy),
		replayBuffer: repairReplayBuffer(rl.replayBuffer),
	};
}

function repairMutation(mutation: MutationGenome): MutationGenome {
	return {
		...mutation,
		rate: clamp(mutation.rate ?? 0.1, 0.001, 0.5),
		sigma: Math.max(1e-5, mutation.sigma ?? 0.05),
		selfSigma: Math.max(1e-5, mutation.selfSigma ?? 0.05),
	};
}

function repairCrossover(crossover: CrossoverGenome): CrossoverGenome {
	return {
		...crossover,
		probability: clamp(crossover.probability ?? 0.7, 0, 1),
		blendAlpha: clamp(crossover.blendAlpha ?? 0.5, 0, 1),
		sbxEta: Math.max(1, crossover.sbxEta ?? 2),
	};
}

function repairGAControl(gaControl: GAControlGenome): GAControlGenome {
	return {
		...gaControl,
		populationSize: Math.max(2, Math.round(gaControl.populationSize ?? 20)),
		elitismFraction: clamp(gaControl.elitismFraction ?? 0.1, 0, 1),
		survivorFraction: clamp(gaControl.survivorFraction ?? 0.5, 0, 1),
		episodesPerIndividual: Math.max(
			1,
			Math.round(gaControl.episodesPerIndividual ?? 3)
		),
		maxGenerations: Math.max(1, Math.round(gaControl.maxGenerations ?? 100)),
	};
}

export function repairGenome(genome: Genome): Genome {
	return {
		id:
			typeof genome.id === "string" && genome.id.length > 0
				? genome.id
				: "repaired",
		generation: Math.max(0, Math.round(genome.generation ?? 0)),
		network: repairNetwork(genome.network),
		rl: repairRL(genome.rl),
		mutation: repairMutation(genome.mutation),
		crossover: repairCrossover(genome.crossover),
		gaControl: repairGAControl(genome.gaControl),
		fitness: genome.fitness,
	};
}
