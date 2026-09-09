import { NumericRange } from "@trading-model/common/domain/numeric-range";
import {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import { NoiseStd } from "@trading-model/common/domain/primitives/noise-std";
import { Temperature } from "@trading-model/common/domain/primitives/temperature";
import { InitialisationType } from "../neural-network/type";
import type { Genome } from "./genome-types";
import { EncodedLayer, LAYER_STRIDE, readEncodedLayer } from "./layer-codec";

export { readEncodedLayer } from "./layer-codec";

import { clamp } from "./utils";

export const MAX_DEPTH = 12;

interface ScalarFieldDef<
	TKey extends keyof DecodedScalars = keyof DecodedScalars,
> {
	key: TKey;
	accessor: (genome: Genome) => number;
	encode: (value: number) => number;
	decode: (value: number) => number;
	clamp: NumericRange;
	round?: boolean;
}

export interface DecodedScalars {
	gamma: Probability;
	learningRate: Percentage;
	clipMin: number;
	clipMax: number;
	scaleFactor: Percentage;
	maxEpisodeLength: PositiveInt;
	nStepReturn: PositiveInt;
	frameSkip: PositiveInt;
	epsilonStart: Probability;
	epsilonMin: Probability;
	epsilonDecay: Probability;
	temperature: Temperature;
	noiseStd: NoiseStd;
	noiseDecay: Probability;
	bufferSize: PositiveInt;
	alphaPER: Probability;
	betaPER: Probability;
	mutationRate: Percentage;
	sigma: Percentage;
	selfSigma: Percentage;
	inputDim: PositiveInt;
	outputDim: PositiveInt;
	depth: PositiveInt;
}

const SCALAR_FIELDS: {
	[TKey in keyof DecodedScalars]: ScalarFieldDef<TKey>;
}[keyof DecodedScalars][] = [
	{
		key: "gamma",
		accessor: (genome) => genome.rl.gamma,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.8, 0.9999),
	},
	{
		key: "learningRate",
		accessor: (genome) => genome.rl.learningRate,
		encode: (value) => (Math.log10(value) / 6 + 1) / 2,
		decode: (value) => 10 ** ((value * 2 - 1) * 6),
		clamp: new NumericRange(1e-6, 1e-1),
	},
	{
		key: "clipMin",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.lo,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
	},
	{
		key: "clipMax",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.hi,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
	},
	{
		key: "scaleFactor",
		accessor: (genome) => genome.rl.rewardShaping.scaleFactor,
		encode: (value) => (Math.log10(value) / 3 + 1) / 2,
		decode: (value) => 10 ** ((value - 1) * 3),
		clamp: new NumericRange(0.001, 1000),
	},
	{
		key: "maxEpisodeLength",
		accessor: (genome) => genome.rl.horizon.maxEpisodeLength,
		encode: (value) => value / 2_000,
		decode: (value) => value * 2_000,
		clamp: new NumericRange(10, 20_000),
		round: true,
	},
	{
		key: "nStepReturn",
		accessor: (genome) => genome.rl.horizon.nStepReturn,
		encode: (value) => value / 20,
		decode: (value) => value * 20,
		clamp: new NumericRange(1, 20),
		round: true,
	},
	{
		key: "frameSkip",
		accessor: (genome) => genome.rl.horizon.frameSkip,
		encode: (value) => value / 10,
		decode: (value) => value * 10,
		clamp: new NumericRange(1, 10),
		round: true,
	},
	{
		key: "epsilonStart",
		accessor: (genome) => genome.rl.discretePolicy.epsilonStart,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.1, 1.0),
	},
	{
		key: "epsilonMin",
		accessor: (genome) => genome.rl.discretePolicy.epsilonMin,
		encode: (value) => value / 0.2,
		decode: (value) => value * 0.2,
		clamp: new NumericRange(0.001, 0.2),
	},
	{
		key: "epsilonDecay",
		accessor: (genome) => genome.rl.discretePolicy.epsilonDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.9, 0.9999),
	},
	{
		key: "temperature",
		accessor: (genome) => genome.rl.discretePolicy.temperature,
		encode: (value) => Math.log10(value) / 2 + 0.5,
		decode: (value) => 10 ** ((value - 0.5) * 2),
		clamp: new NumericRange(0.01, 100),
	},
	{
		key: "noiseStd",
		accessor: (genome) => genome.rl.continuousPolicy.noiseStd,
		encode: (value) => value / 5,
		decode: (value) => value * 5,
		clamp: new NumericRange(0.001, 5),
	},
	{
		key: "noiseDecay",
		accessor: (genome) => genome.rl.continuousPolicy.noiseDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.9, 0.9999),
	},
	{
		key: "bufferSize",
		accessor: (genome) => genome.rl.replayBuffer.bufferSize,
		encode: (value) => Math.log10(value) / 6,
		decode: (value) => 10 ** (value * 6),
		clamp: new NumericRange(100, 1_000_000),
		round: true,
	},
	{
		key: "alphaPER",
		accessor: (genome) => genome.rl.replayBuffer.alphaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0, 1),
	},
	{
		key: "betaPER",
		accessor: (genome) => genome.rl.replayBuffer.betaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0, 1),
	},
	{
		key: "mutationRate",
		accessor: (genome) => genome.mutation.rates.rate,
		encode: (value) => value / 0.5,
		decode: (value) => value * 0.5,
		clamp: new NumericRange(0.001, 0.5),
	},
	{
		key: "sigma",
		accessor: (genome) => genome.mutation.rates.sigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: new NumericRange(1e-5, 10),
	},
	{
		key: "selfSigma",
		accessor: (genome) => genome.mutation.rates.selfSigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: new NumericRange(1e-5, 10),
	},
	{
		key: "inputDim",
		accessor: (genome) => genome.network.inputDim,
		encode: (value) => value / 256,
		decode: (value) => value * 256,
		clamp: new NumericRange(1, 256),
		round: true,
	},
	{
		key: "outputDim",
		accessor: (genome) => genome.network.outputDim,
		encode: (value) => value / 64,
		decode: (value) => value * 64,
		clamp: new NumericRange(1, 64),
		round: true,
	},
	{
		key: "depth",
		accessor: (genome) => genome.network.hiddenLayers.length,
		encode: (value) => value / MAX_DEPTH,
		decode: (value) => value * MAX_DEPTH,
		clamp: new NumericRange(1, MAX_DEPTH),
		round: true,
	},
] as const;

export const SCALAR_DIM = SCALAR_FIELDS.length;

export function encodedDim(hiddenLayerCount: number): number {
	return SCALAR_DIM + hiddenLayerCount * LAYER_STRIDE;
}

export function layerOffset(layerIndex: number): number {
	return SCALAR_DIM + layerIndex * LAYER_STRIDE;
}

function decodeScalars(arr: Float32Array): DecodedScalars {
	const result: Partial<Record<keyof DecodedScalars, number>> = {};
	for (let i = 0; i < SCALAR_FIELDS.length; i++) {
		const field = SCALAR_FIELDS[i];
		const decoded = field.decode(arr[i]);
		const clamped = field.clamp.clamp(decoded);
		result[field.key] = field.round ? Math.round(clamped) : clamped;
	}
	return result as DecodedScalars;
}

function writeLayers(arr: Float32Array, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);
	for (let i = 0; i < layers.length; i++) {
		const enc = new EncodedLayer(
			layers[i].neurons / 512,
			layers[i].activation,
			layers[i].connectionType
		);
		enc.write(arr, layerOffset(i));
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

function decodeHiddenLayers(
	vec: Float32Array,
	template: Genome,
	depth: number
): Genome["network"]["hiddenLayers"] {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth; i++) {
		const enc = readEncodedLayer(vec, layerOffset(i));
		const biasType =
			template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(enc.neurons * 512), 1, 512) as PositiveInt,
			activation: enc.activation,
			connectionType: enc.connectionType,
			biasType,
		});
	}
	return hiddenLayers;
}

function decodeRewardShaping(
	scalars: DecodedScalars,
	template: Genome
): Genome["rl"]["rewardShaping"] {
	return {
		...template.rl.rewardShaping,
		clipBounds: new NumericRange(
			Math.min(scalars.clipMin, scalars.clipMax - 1e-6),
			Math.max(scalars.clipMax, scalars.clipMin + 1e-6)
		),
		scaleFactor: Percentage.of(scalars.scaleFactor),
	};
}

function decodeHorizon(scalars: DecodedScalars): Genome["rl"]["horizon"] {
	return {
		maxEpisodeLength: PositiveInt.of(scalars.maxEpisodeLength),
		nStepReturn: PositiveInt.of(scalars.nStepReturn),
		frameSkip: PositiveInt.of(scalars.frameSkip),
	};
}

function decodeDiscretePolicy(
	scalars: DecodedScalars,
	template: Genome
): Genome["rl"]["discretePolicy"] {
	return {
		...template.rl.discretePolicy,
		epsilonStart: Probability.of(scalars.epsilonStart),
		epsilonMin: Probability.of(scalars.epsilonMin),
		epsilonDecay: Probability.of(scalars.epsilonDecay),
		temperature: Temperature.of(scalars.temperature),
	};
}

function decodeContinuousPolicy(
	scalars: DecodedScalars,
	template: Genome
): Genome["rl"]["continuousPolicy"] {
	return {
		...template.rl.continuousPolicy,
		noiseStd: NoiseStd.of(scalars.noiseStd),
		noiseDecay: Probability.of(scalars.noiseDecay),
	};
}

function decodeReplayBuffer(
	scalars: DecodedScalars,
	template: Genome
): Genome["rl"]["replayBuffer"] {
	return {
		...template.rl.replayBuffer,
		bufferSize: PositiveInt.of(scalars.bufferSize),
		alphaPER: Probability.of(scalars.alphaPER),
		betaPER: Probability.of(scalars.betaPER),
	};
}

function decodeRL(scalars: DecodedScalars, template: Genome): Genome["rl"] {
	return {
		gamma: Probability.of(scalars.gamma),
		learningRate: Percentage.of(scalars.learningRate),
		rewardShaping: decodeRewardShaping(scalars, template),
		horizon: decodeHorizon(scalars),
		discretePolicy: decodeDiscretePolicy(scalars, template),
		continuousPolicy: decodeContinuousPolicy(scalars, template),
		replayBuffer: decodeReplayBuffer(scalars, template),
	};
}

function decodeMutation(
	scalars: DecodedScalars,
	template: Genome
): Genome["mutation"] {
	return {
		...template.mutation,
		rates: {
			...template.mutation.rates,
			rate: Percentage.of(scalars.mutationRate),
			sigma: Percentage.of(scalars.sigma),
			selfSigma: Percentage.of(scalars.selfSigma),
		},
	};
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	const scalars = decodeScalars(vec);
	const hiddenLayers = decodeHiddenLayers(vec, template, scalars.depth);
	const network: Genome["network"] = {
		inputDim: PositiveInt.of(scalars.inputDim),
		outputDim: PositiveInt.of(scalars.outputDim),
		hiddenLayers,
		normalization: template.network.normalization,
	};
	return {
		id: template.id,
		generation: template.generation as PositiveInt,
		network,
		rl: decodeRL(scalars, template),
		mutation: decodeMutation(scalars, template),
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
