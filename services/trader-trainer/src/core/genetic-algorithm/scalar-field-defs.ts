import {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import { NumericRange } from "./bounded";
import { MAX_DEPTH } from "./genome-layout-constants";
import type { Genome } from "./genome-types";

interface ScalarFieldDef {
	key: keyof DecodedScalars;
	accessor: (genome: Genome) => number;
	encode: (value: number) => number;
	decode: (value: number) => number;
	clamp: NumericRange;
	round?: boolean;
	cast: (value: number) => DecodedScalars[keyof DecodedScalars];
}

const SCALAR_FIELDS: ScalarFieldDef[] = [
	{
		key: "gamma",
		accessor: (genome) => genome.rl.gamma,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.8, 0.9999),
		cast: (value) => Probability.of(value),
	},
	{
		key: "learningRate",
		accessor: (genome) => genome.rl.learningRate,
		encode: (value) => (Math.log10(value) / 6 + 1) / 2,
		decode: (value) => 10 ** ((value * 2 - 1) * 6),
		clamp: new NumericRange(1e-6, 1e-1),
		cast: (value) => Percentage.of(value),
	},
	{
		key: "clipMin",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.lo,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
		cast: (value) => value,
	},
	{
		key: "clipMax",
		accessor: (genome) => genome.rl.rewardShaping.clipBounds.hi,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
		cast: (value) => value,
	},
	{
		key: "scaleFactor",
		accessor: (genome) => genome.rl.rewardShaping.scaleFactor,
		encode: (value) => (Math.log10(value) / 3 + 1) / 2,
		decode: (value) => 10 ** ((value - 1) * 3),
		clamp: new NumericRange(0.001, 1000),
		cast: (value) => Percentage.of(value),
	},
	{
		key: "maxEpisodeLength",
		accessor: (genome) => genome.rl.horizon.maxEpisodeLength,
		encode: (value) => value / 2_000,
		decode: (value) => value * 2_000,
		clamp: new NumericRange(10, 20_000),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "nStepReturn",
		accessor: (genome) => genome.rl.horizon.nStepReturn,
		encode: (value) => value / 20,
		decode: (value) => value * 20,
		clamp: new NumericRange(1, 20),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "frameSkip",
		accessor: (genome) => genome.rl.horizon.frameSkip,
		encode: (value) => value / 10,
		decode: (value) => value * 10,
		clamp: new NumericRange(1, 10),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "epsilonStart",
		accessor: (genome) => genome.rl.discretePolicy.epsilonStart,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.1, 1.0),
		cast: (value) => Probability.of(value),
	},
	{
		key: "epsilonMin",
		accessor: (genome) => genome.rl.discretePolicy.epsilonMin,
		encode: (value) => value / 0.2,
		decode: (value) => value * 0.2,
		clamp: new NumericRange(0.001, 0.2),
		cast: (value) => Probability.of(value),
	},
	{
		key: "epsilonDecay",
		accessor: (genome) => genome.rl.discretePolicy.epsilonDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.9, 0.9999),
		cast: (value) => Probability.of(Math.min(1, Math.max(0, value))),
	},
	{
		key: "temperature",
		accessor: (genome) => genome.rl.discretePolicy.temperature,
		encode: (value) => Math.log10(value) / 2 + 0.5,
		decode: (value) => 10 ** ((value - 0.5) * 2),
		clamp: new NumericRange(0.01, 100),
		cast: (value) => value,
	},
	{
		key: "noiseStd",
		accessor: (genome) => genome.rl.continuousPolicy.noiseStd,
		encode: (value) => value / 5,
		decode: (value) => value * 5,
		clamp: new NumericRange(0.001, 5),
		cast: (value) => value,
	},
	{
		key: "noiseDecay",
		accessor: (genome) => genome.rl.continuousPolicy.noiseDecay,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0.9, 0.9999),
		cast: (value) => Probability.of(value),
	},
	{
		key: "bufferSize",
		accessor: (genome) => genome.rl.replayBuffer.bufferSize,
		encode: (value) => Math.log10(value) / 6,
		decode: (value) => 10 ** (value * 6),
		clamp: new NumericRange(100, 1_000_000),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "alphaPER",
		accessor: (genome) => genome.rl.replayBuffer.alphaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0, 1),
		cast: (value) => Probability.of(value),
	},
	{
		key: "betaPER",
		accessor: (genome) => genome.rl.replayBuffer.betaPER,
		encode: (value) => value,
		decode: (value) => value,
		clamp: new NumericRange(0, 1),
		cast: (value) => Probability.of(value),
	},
	{
		key: "mutationRate",
		accessor: (genome) => genome.mutation.rates.rate,
		encode: (value) => value / 0.5,
		decode: (value) => value * 0.5,
		clamp: new NumericRange(0.001, 0.5),
		cast: (value) => Percentage.of(value),
	},
	{
		key: "sigma",
		accessor: (genome) => genome.mutation.rates.sigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: new NumericRange(1e-5, 10),
		cast: (value) => Percentage.of(value),
	},
	{
		key: "selfSigma",
		accessor: (genome) => genome.mutation.rates.selfSigma,
		encode: (value) => Math.log10(Math.max(1e-5, value)) / 4 + 1.25,
		decode: (value) => 10 ** ((value - 1.25) * 4),
		clamp: new NumericRange(1e-5, 10),
		cast: (value) => Percentage.of(value),
	},
	{
		key: "inputDim",
		accessor: (genome) => genome.network.inputDim,
		encode: (value) => value / 256,
		decode: (value) => value * 256,
		clamp: new NumericRange(1, 256),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "outputDim",
		accessor: (genome) => genome.network.outputDim,
		encode: (value) => value / 64,
		decode: (value) => value * 64,
		clamp: new NumericRange(1, 64),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
	{
		key: "depth",
		accessor: (genome) => genome.network.hiddenLayers.length,
		encode: (value) => value / MAX_DEPTH,
		decode: (value) => value * MAX_DEPTH,
		clamp: new NumericRange(1, MAX_DEPTH),
		round: true,
		cast: (value) => PositiveInt.of(value),
	},
];

const scalarIndexByKey: { [Key in keyof DecodedScalars]: number } = (() => {
	const map: Record<string, number> = {};
	for (let i = 0; i < SCALAR_FIELDS.length; i++) {
		map[SCALAR_FIELDS[i].key] = i;
	}
	return map as { [Key in keyof DecodedScalars]: number };
})();

export function getEncodedScalar(
	arr: Float32Array,
	key: keyof DecodedScalars
): number {
	return arr[scalarIndexByKey[key]];
}

export function setEncodedScalar(
	arr: Float32Array,
	key: keyof DecodedScalars,
	value: number
): void {
	arr[scalarIndexByKey[key]] = value;
}

export { SCALAR_FIELDS, scalarIndexByKey };

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
	temperature: number;
	noiseStd: number;
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
