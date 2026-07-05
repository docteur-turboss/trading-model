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
	ValidationContext,
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
	ctx: ValidationContext,
	message: string,
	actual: unknown
): void {
	const { errors, path } = ctx;
	errors.push({ path, message, actual });
}

function checkRange(
	ctx: ValidationContext,
	value: unknown,
	lo: number,
	hi: number
): void {
	const { errors, path } = ctx;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < lo ||
		value > hi
	) {
		err(ctx, `must be a finite number in [${lo}, ${hi}]`, value);
	}
}

function checkPositiveInt(
	ctx: ValidationContext,
	value: unknown,
	min = 1
): void {
	const { errors, path } = ctx;
	if (!Number.isInteger(value) || (value as number) < min) {
		err(ctx, `must be an integer ≥ ${min}`, value);
	}
}

function validateLayer(
	ctx: ValidationContext,
	layer: LayerGenome
): void {
	checkPositiveInt({ ...ctx, path: `${ctx.path}.neurons` }, layer.neurons);
	if (!VALID_ACTIVATIONS.has(layer.activation)) {
		err(
			{ ...ctx, path: `${ctx.path}.activation` },
			"unknown activation type",
			layer.activation
		);
	}
	if (!VALID_CONNECTION_TYPES.has(layer.connectionType)) {
		err(
			{ ...ctx, path: `${ctx.path}.connectionType` },
			"unknown connection type",
			layer.connectionType
		);
	}
	if (!VALID_BIAS_TYPES.has(layer.biasType)) {
		err({ ...ctx, path: `${ctx.path}.biasType` }, "unknown bias type", layer.biasType);
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

function validateIdentity(ctx: ValidationContext, genome: Genome): void {
	if (typeof genome.id !== "string" || genome.id.length === 0) {
		err({ ...ctx, path: "id" }, "must be a non-empty string", genome.id);
	}
	if (!Number.isInteger(genome.generation) || genome.generation < 0) {
		err(
			{ ...ctx, path: "generation" },
			"must be a non-negative integer",
			genome.generation
		);
	}
}

function validateNetwork(
	ctx: ValidationContext,
	network: NetworkGenome
): void {
	checkPositiveInt({ ...ctx, path: "network.inputDim" }, network.inputDim);
	checkPositiveInt({ ...ctx, path: "network.outputDim" }, network.outputDim);
	if (
		!Array.isArray(network.hiddenLayers) ||
		network.hiddenLayers.length === 0
	) {
		err(
			{ ...ctx, path: "network.hiddenLayers" },
			"must be a non-empty array",
			network.hiddenLayers
		);
	} else {
		network.hiddenLayers.forEach((layer, index) => {
			validateLayer({ ...ctx, path: `network.hiddenLayers[${index}]` }, layer);
		});
	}
	if (!VALID_NORM_TYPES.has(network.normalization)) {
		err(
			{ ...ctx, path: "network.normalization" },
			"unknown normalization type",
			network.normalization
		);
	}
}

function validateRL(ctx: ValidationContext, rl: RLGenome): void {
	checkRange({ ...ctx, path: "rl.gamma" }, rl.gamma, 0.8, 0.9999);
	checkRange({ ...ctx, path: "rl.learningRate" }, rl.learningRate, 1e-6, 1e-1);
	validateRewardShaping(ctx, rl.rewardShaping);
	validateHorizon(ctx, rl.horizon);
	validateDiscretePolicy(ctx, rl.discretePolicy);
	validateContinuousPolicy(ctx, rl.continuousPolicy);
	validateReplayBuffer(ctx, rl.replayBuffer);
}

function validateRewardShaping(
	ctx: ValidationContext,
	rs: RewardShapingGenome
): void {
	if (rs.clipMin >= rs.clipMax) {
		err({ ...ctx, path: "rl.rewardShapingenome.clip" }, "clipMin must be < clipMax", {
			clipMin: rs.clipMin,
			clipMax: rs.clipMax,
		});
	}
	checkRange(
		{ ...ctx, path: "rl.rewardShapingenome.scaleFactor" },
		rs.scaleFactor,
		0.001,
		1000
	);
}

function validateHorizon(
	ctx: ValidationContext,
	horizon: HorizonGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "rl.horizon.maxEpisodeLength" },
		horizon.maxEpisodeLength,
		10
	);
	checkPositiveInt({ ...ctx, path: "rl.horizon.nStepReturn" }, horizon.nStepReturn);
	checkPositiveInt({ ...ctx, path: "rl.horizon.frameSkip" }, horizon.frameSkip);
}

function validateDiscretePolicy(
	ctx: ValidationContext,
	dp: DiscretePolicyGenome
): void {
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonStart" },
		dp.epsilonStart,
		0.1,
		1.0
	);
	checkRange({ ...ctx, path: "rl.discretePolicy.epsilonMin" }, dp.epsilonMin, 0.001, 0.2);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.epsilonDecay" },
		dp.epsilonDecay,
		0.9,
		0.9999
	);
	checkRange(
		{ ...ctx, path: "rl.discretePolicy.temperature" },
		dp.temperature,
		0.01,
		100
	);
}

function validateContinuousPolicy(
	ctx: ValidationContext,
	cp: ContinuousPolicyGenome
): void {
	if (cp.clipMin >= cp.clipMax) {
		err({ ...ctx, path: "rl.continuousPolicy.clip" }, "clipMin must be < clipMax", {
			clipMin: cp.clipMin,
			clipMax: cp.clipMax,
		});
	}
	checkRange({ ...ctx, path: "rl.continuousPolicy.noiseStd" }, cp.noiseStd, 0.001, 5);
	checkRange(
		{ ...ctx, path: "rl.continuousPolicy.noiseDecay" },
		cp.noiseDecay,
		0.9,
		0.9999
	);
}

function validateReplayBuffer(
	ctx: ValidationContext,
	rb: ReplayBufferGenome
): void {
	checkPositiveInt({ ...ctx, path: "rl.replayBuffer.bufferSize" }, rb.bufferSize, 100);
	checkRange({ ...ctx, path: "rl.replayBuffer.alphaPER" }, rb.alphaPER, 0, 1);
	checkRange({ ...ctx, path: "rl.replayBuffer.betaPER" }, rb.betaPER, 0, 1);
}

function validateMutation(
	ctx: ValidationContext,
	mutation: MutationGenome
): void {
	checkRange({ ...ctx, path: "mutation.rate" }, mutation.rate, 0.001, 0.5);
	checkRange({ ...ctx, path: "mutation.sigma" }, mutation.sigma, 1e-5, 10);
	checkRange({ ...ctx, path: "mutation.selfSigma" }, mutation.selfSigma, 1e-5, 10);
}

function validateCrossover(
	ctx: ValidationContext,
	crossover: CrossoverGenome
): void {
	checkRange({ ...ctx, path: "crossover.probability" }, crossover.probability, 0, 1);
	checkRange({ ...ctx, path: "crossover.blendAlpha" }, crossover.blendAlpha, 0, 1);
	checkRange({ ...ctx, path: "crossover.sbxEta" }, crossover.sbxEta, 1, 100);
}

function validateGAControl(
	ctx: ValidationContext,
	ga: GAControlGenome
): void {
	checkPositiveInt({ ...ctx, path: "gaControl.populationSize" }, ga.populationSize, 2);
	checkRange({ ...ctx, path: "gaControl.elitismFraction" }, ga.elitismFraction, 0, 1);
	checkRange({ ...ctx, path: "gaControl.survivorFraction" }, ga.survivorFraction, 0, 1);
	checkPositiveInt({ ...ctx, path: "gaControl.maxGenerations" }, ga.maxGenerations);
	checkPositiveInt(
		{ ...ctx, path: "gaControl.episodesPerIndividual" },
		ga.episodesPerIndividual
	);
}

export function validateGenome(genome: Genome): ValidationResult {
	const errors: ValidationError[] = [];
	const ctx: ValidationContext = { errors, path: "" };
	validateIdentity(ctx, genome);
	validateNetwork(ctx, genome.network);
	validateRL(ctx, genome.rl);
	validateMutation(ctx, genome.mutation);
	validateCrossover(ctx, genome.crossover);
	validateGAControl(ctx, genome.gaControl);
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
