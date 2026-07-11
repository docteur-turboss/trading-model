import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../neural-network/type";
import type { Bounded } from "./bounded";
import { createBounded } from "./bounded";
import type { Genome } from "./genome-types";
import { clamp } from "./utils";

export const MAX_DEPTH = 12;
const LAYER_STRIDE = 3;

const LAYER_OFFSETS = {
	NEURONS: 0,
	ACTIVATION: 1,
	CONNECTION_TYPE: 2,
} as const;

interface ScalarFieldDef {
	name: string;
	key: keyof DecodedScalars;
	accessor: (genome: Genome) => number;
	encode: (value: number) => number;
	decode: (value: number) => number;
	clamp: Bounded<number>;
	round?: boolean;
}

const SCALAR_FIELDS: ScalarFieldDef[] = [
	{
		name: "Gamma",
		key: "gamma",
		accessor: (genome) => genome.rl.gamma,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0.8, max: 0.9999 },
	},
	{
		name: "LearningRate",
		key: "learningRate",
		accessor: (genome) => genome.rl.learningRate,
		encode: (value) => (Math.log10(value) / 6 + 1) / 2,
		decode: (value) => 10 ** ((value * 2 - 1) * 6),
		clamp: { min: 1e-6, max: 1e-1 },
	},
	{
		name: "ClipMin",
		key: "clipMin",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.min,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
	},
	{
		name: "ClipMax",
		key: "clipMax",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.max,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
	},
	{
		name: "ScaleFactor",
		key: "scaleFactor",
		accessor: (genome) => genome.rl.rewardShaping.scaleFactor,
		encode: (value) => (Math.log10(value) / 3 + 1) / 2,
		decode: (value) => 10 ** ((value - 1) * 3),
		clamp: { min: 0.001, max: 1000 },
	},
	{
		name: "MaxEpisodeLength",
		key: "maxEpisodeLength",
		accessor: (genome) => genome.rl.horizon.maxEpisodeLength,
		encode: (value) => value / 2_000,
		decode: (value) => value * 2_000,
		clamp: { min: 10, max: 20_000 },
		round: true,
	},
	{
		name: "NStepReturn",
		key: "nStepReturn",
		accessor: (genome) => genome.rl.horizon.nStepReturn,
		encode: (value) => value / 20,
		decode: (value) => value * 20,
		clamp: { min: 1, max: 20 },
		round: true,
	},
	{
		name: "FrameSkip",
		key: "frameSkip",
		accessor: (genome) => genome.rl.horizon.frameSkip,
		encode: (value) => value / 10,
		decode: (value) => value * 10,
		clamp: { min: 1, max: 10 },
		round: true,
	},
	{
		name: "EpsilonStart",
		key: "epsilonStart",
		accessor: (genome) => genome.rl.discretePolicy.epsilonStart,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0.1, max: 1.0 },
	},
	{
		name: "EpsilonMin",
		key: "epsilonMin",
		accessor: (genome) => genome.rl.discretePolicy.epsilonMin,
		encode: (value) => value / 0.2,
		decode: (value) => value * 0.2,
		clamp: { min: 0.001, max: 0.2 },
	},
	{
		name: "EpsilonDecay",
		key: "epsilonDecay",
		accessor: (genome) => genome.rl.discretePolicy.epsilonDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0.9, max: 0.9999 },
	},
	{
		name: "Temperature",
		key: "temperature",
		accessor: (genome) => genome.rl.discretePolicy.temperature,
		encode: (value) => Math.log10(value) / 2 + 0.5,
		decode: (value) => 10 ** ((value - 0.5) * 2),
		clamp: { min: 0.01, max: 100 },
	},
	{
		name: "NoiseStd",
		key: "noiseStd",
		accessor: (genome) => genome.rl.continuousPolicy.noiseStd,
		encode: (value) => value / 5,
		decode: (value) => value * 5,
		clamp: { min: 0.001, max: 5 },
	},
	{
		name: "NoiseDecay",
		key: "noiseDecay",
		accessor: (genome) => genome.rl.continuousPolicy.noiseDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0.9, max: 0.9999 },
	},
	{
		name: "BufferSize",
		key: "bufferSize",
		accessor: (genome) => genome.rl.replayBuffer.bufferSize,
		encode: (value) => Math.log10(value) / 6,
		decode: (value) => 10 ** (value * 6),
		clamp: { min: 100, max: 1_000_000 },
		round: true,
	},
	{
		name: "AlphaPER",
		key: "alphaPER",
		accessor: (genome) => genome.rl.replayBuffer.alphaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0, max: 1 },
	},
	{
		name: "BetaPER",
		key: "betaPER",
		accessor: (genome) => genome.rl.replayBuffer.betaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: { min: 0, max: 1 },
	},
	{
		name: "MutationRate",
		key: "mutationRate",
		accessor: (genome) => genome.mutation.rates.rate,
		encode: (value) => value / 0.5,
		decode: (value) => value * 0.5,
		clamp: { min: 0.001, max: 0.5 },
	},
	{
		name: "MutationSigma",
		key: "sigma",
		accessor: (genome) => genome.mutation.rates.sigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: { min: 1e-5, max: 10 },
	},
	{
		name: "MutationSelfSigma",
		key: "selfSigma",
		accessor: (genome) => genome.mutation.rates.selfSigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: { min: 1e-5, max: 10 },
	},
	{
		name: "NetworkInputDim",
		key: "inputDim",
		accessor: (genome) => genome.network.inputDim,
		encode: (value) => value / 256,
		decode: (value) => value * 256,
		clamp: { min: 1, max: 256 },
		round: true,
	},
	{
		name: "NetworkOutputDim",
		key: "outputDim",
		accessor: (genome) => genome.network.outputDim,
		encode: (value) => value / 64,
		decode: (value) => value * 64,
		clamp: { min: 1, max: 64 },
		round: true,
	},
	{
		name: "NetworkDepth",
		key: "depth",
		accessor: (genome) => genome.network.hiddenLayers.length,
		encode: (value) => value / MAX_DEPTH,
		decode: (value) => value * MAX_DEPTH,
		clamp: { min: 1, max: MAX_DEPTH },
		round: true,
	},
];

type ScalarFieldName = (typeof SCALAR_FIELDS)[number]["name"];

export const ENCODING_OFFSETS: Readonly<Record<ScalarFieldName, number>> =
	(() => {
		const map: Record<string, number> = {};
		for (let i = 0; i < SCALAR_FIELDS.length; i++) {
			map[SCALAR_FIELDS[i].name] = i;
		}
		return map as Readonly<Record<ScalarFieldName, number>>;
	})();

export const SCALAR_DIM = SCALAR_FIELDS.length;

/* ------------------------------------------------------------------ */
/*  Layer encoding (neurons+activation+connectionType)                 */
/* ------------------------------------------------------------------ */

export const ACTIVATIONS: ActivationType[] = [
	ActivationType.Relu,
	ActivationType.Sigmoid,
	ActivationType.Tanh,
	ActivationType.LeakyReLu,
	ActivationType.Elu,
	ActivationType.Mish,
	ActivationType.Gelu,
	ActivationType.Softmax,
];

export const CONNECTION_TYPES: ConnectionType[] = [
	ConnectionType.DenseSkip,
	ConnectionType.FullyConnected,
	ConnectionType.ResidualConnection,
];

export function activationFromIndex(idx: number): ActivationType {
	return ACTIVATIONS[idx] ?? ACTIVATIONS[0];
}

export function connectionTypeFromIndex(idx: number): ConnectionType {
	return CONNECTION_TYPES[idx] ?? CONNECTION_TYPES[0];
}

export function encodedDim(hiddenLayerCount: number): number {
	return SCALAR_DIM + hiddenLayerCount * LAYER_STRIDE;
}

export function layerOffset(layerIndex: number): number {
	return SCALAR_DIM + layerIndex * LAYER_STRIDE;
}

export interface EncodedLayer {
	neurons: number;
	activation: ActivationType;
	connectionType: ConnectionType;
}

export function readEncodedLayer(
	arr: Float32Array,
	offset: number
): EncodedLayer {
	return {
		neurons: arr[offset + LAYER_OFFSETS.NEURONS],
		activation: activationFromIndex(
			Math.round(arr[offset + LAYER_OFFSETS.ACTIVATION])
		),
		connectionType: connectionTypeFromIndex(
			Math.round(arr[offset + LAYER_OFFSETS.CONNECTION_TYPE])
		),
	};
}

function writeEncodedLayer(
	arr: Float32Array,
	offset: number,
	layer: EncodedLayer
): void {
	const actIdx = ACTIVATIONS.indexOf(layer.activation);
	const ctIdx = CONNECTION_TYPES.indexOf(layer.connectionType);
	arr[offset + LAYER_OFFSETS.NEURONS] = layer.neurons;
	arr[offset + LAYER_OFFSETS.ACTIVATION] = actIdx >= 0 ? actIdx : 0;
	arr[offset + LAYER_OFFSETS.CONNECTION_TYPE] = ctIdx >= 0 ? ctIdx : 0;
}

/* ------------------------------------------------------------------ */
/*  Schema-driven encode / decode                                      */
/* ------------------------------------------------------------------ */

interface DecodedScalars {
	gamma: number;
	learningRate: number;
	clipMin: number;
	clipMax: number;
	scaleFactor: number;
	maxEpisodeLength: number;
	nStepReturn: number;
	frameSkip: number;
	epsilonStart: number;
	epsilonMin: number;
	epsilonDecay: number;
	temperature: number;
	noiseStd: number;
	noiseDecay: number;
	bufferSize: number;
	alphaPER: number;
	betaPER: number;
	mutationRate: number;
	sigma: number;
	selfSigma: number;
	inputDim: number;
	outputDim: number;
	depth: number;
}

function decodeScalars(arr: Float32Array): DecodedScalars {
	const result: Partial<DecodedScalars> = {};
	for (let i = 0; i < SCALAR_FIELDS.length; i++) {
		const field = SCALAR_FIELDS[i];
		const raw = arr[i];
		const decoded = field.decode(raw);
		const clamped = clamp(decoded, field.clamp.min, field.clamp.max);
		result[field.key] = field.round ? Math.round(clamped) : clamped;
	}
	return result as DecodedScalars;
}

function writeLayers(arr: Float32Array, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);
	for (let i = 0; i < layers.length; i++) {
		writeEncodedLayer(arr, layerOffset(i), {
			neurons: layers[i].neurons / 512,
			activation: layers[i].activation,
			connectionType: layers[i].connectionType,
		});
	}
}

export function encodeGenome(genome: Genome): Float32Array {
	const layerCount = Math.min(genome.network.hiddenLayers.length, MAX_DEPTH);
	const totalDim = encodedDim(layerCount);
	const arr = new Float32Array(totalDim);
	for (let i = 0; i < SCALAR_FIELDS.length; i++) {
		const field = SCALAR_FIELDS[i];
		arr[i] = field.encode(field.accessor(genome));
	}
	writeLayers(arr, genome.network);
	return arr;
}

export function encodePopulation(population: Genome[]): Float32Array {
	if (population.length === 0) {
		return new Float32Array(0);
	}
	const dim = encodedDim(
		Math.min(population[0].network.hiddenLayers.length, MAX_DEPTH)
	);
	const mat = new Float32Array(population.length * dim);
	for (let i = 0; i < population.length; i++) {
		mat.set(encodeGenome(population[i]), i * dim);
	}
	return mat;
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	const scalars = decodeScalars(vec);
	const depth = scalars.depth;
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth; i++) {
		const enc = readEncodedLayer(vec, layerOffset(i));
		const biasType =
			template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(enc.neurons * 512), 1, 512),
			activation: enc.activation,
			connectionType: enc.connectionType,
			biasType,
		});
	}
	const network: Genome["network"] = {
		inputDim: scalars.inputDim,
		outputDim: scalars.outputDim,
		hiddenLayers,
		normalization: template.network.normalization,
	};
	return {
		id: template.id,
		generation: template.generation,
		network,
		rl: {
			gamma: scalars.gamma,
			learningRate: scalars.learningRate,
			rewardShaping: {
				...template.rl.rewardShaping,
				clipBounds: createBounded(
					Math.min(scalars.clipMin, scalars.clipMax - 1e-6),
					Math.max(scalars.clipMax, scalars.clipMin + 1e-6)
				),
				scaleFactor: scalars.scaleFactor,
			},
			horizon: {
				maxEpisodeLength: scalars.maxEpisodeLength,
				nStepReturn: scalars.nStepReturn,
				frameSkip: scalars.frameSkip,
			},
			discretePolicy: {
				...template.rl.discretePolicy,
				epsilonStart: scalars.epsilonStart,
				epsilonMin: scalars.epsilonMin,
				epsilonDecay: scalars.epsilonDecay,
				temperature: scalars.temperature,
			},
			continuousPolicy: {
				...template.rl.continuousPolicy,
				noiseStd: scalars.noiseStd,
				noiseDecay: scalars.noiseDecay,
			},
			replayBuffer: {
				...template.rl.replayBuffer,
				bufferSize: scalars.bufferSize,
				alphaPER: scalars.alphaPER,
				betaPER: scalars.betaPER,
			},
		},
		mutation: {
			...template.mutation,
			rates: {
				...template.mutation.rates,
				rate: scalars.mutationRate,
				sigma: scalars.sigma,
				selfSigma: scalars.selfSigma,
			},
		},
		crossover: { ...template.crossover },
		gaControl: { ...template.gaControl },
	};
}

export function decodePopulation(
	mat: Float32Array,
	templates: Genome[]
): Genome[] {
	const dims = templates.map((tmpl) =>
		encodedDim(Math.min(tmpl.network.hiddenLayers.length, MAX_DEPTH))
	);
	const out: Genome[] = [];
	let offset = 0;
	for (let i = 0; i < templates.length; i++) {
		const vec = mat.subarray(offset, offset + dims[i]);
		out.push(decodeGenome(vec, templates[i]));
		offset += dims[i];
	}
	return out;
}
