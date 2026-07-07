import { InitialisationType } from "../neural-network/type";
import { ACTIVATIONS, CONNECTION_TYPES, MAX_DEPTH, SCALAR_DIM, EncodingIndex } from "./encoding-indices";
import type { Genome, MutationGenome, NetworkGenome, RLGenome } from "./genome-types";
import { clamp } from "./utils";

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

function _decodeScalars(arr: Float32Array): DecodedScalars {
	return {
		gamma: clamp(arr[EncodingIndex.Gamma], 0.8, 0.9999),
		learningRate: clamp(10 ** ((arr[EncodingIndex.LearningRate] - 1) * 6), 1e-6, 1e-1),
		clipMin: arr[EncodingIndex.ClipMin],
		clipMax: arr[EncodingIndex.ClipMax],
		scaleFactor: clamp(10 ** ((arr[EncodingIndex.ScaleFactor] - 1) * 3), 0.001, 1000),
		maxEpisodeLength: clamp(Math.round(arr[EncodingIndex.MaxEpisodeLength] * 2_000), 10, 20_000),
		nStepReturn: clamp(Math.round(arr[EncodingIndex.NStepReturn] * 20), 1, 20),
		frameSkip: clamp(Math.round(arr[EncodingIndex.FrameSkip] * 10), 1, 10),
		epsilonStart: clamp(arr[EncodingIndex.EpsilonStart], 0.1, 1.0),
		epsilonMin: clamp(arr[EncodingIndex.EpsilonMin] * 0.2, 0.001, 0.2),
		epsilonDecay: clamp(arr[EncodingIndex.EpsilonDecay], 0.9, 0.9999),
		temperature: clamp(10 ** ((arr[EncodingIndex.Temperature] - 0.5) * 2), 0.01, 100),
		noiseStd: clamp(arr[EncodingIndex.NoiseStd] * 5, 0.001, 5),
		noiseDecay: clamp(arr[EncodingIndex.NoiseDecay], 0.9, 0.9999),
		bufferSize: clamp(Math.round(10 ** (arr[EncodingIndex.BufferSize] * 6)), 100, 1_000_000),
		alphaPER: clamp(arr[EncodingIndex.AlphaPER], 0, 1),
		betaPER: clamp(arr[EncodingIndex.BetaPER], 0, 1),
		mutationRate: clamp(arr[EncodingIndex.MutationRate] * 0.5, 0.001, 0.5),
		sigma: clamp(10 ** ((arr[EncodingIndex.MutationSigma] - 1.25) * 4), 1e-5, 10),
		selfSigma: clamp(10 ** ((arr[EncodingIndex.MutationSelfSigma] - 1.25) * 4), 1e-5, 10),
		inputDim: clamp(Math.round(arr[EncodingIndex.NetworkInputDim] * 256), 1, 256),
		outputDim: clamp(Math.round(arr[EncodingIndex.NetworkOutputDim] * 64), 1, 64),
		depth: clamp(Math.round(arr[EncodingIndex.NetworkDepth] * MAX_DEPTH), 1, MAX_DEPTH),
	};
}

function _decodeLayers(arr: Float32Array, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth; i++) {
		const offset = SCALAR_DIM + i * 3;
		const biasType = template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(arr[offset] * 512), 1, 512),
			activation: ACTIVATIONS[Math.round(arr[offset + 1])] ?? ACTIVATIONS[0],
			connectionType: CONNECTION_TYPES[Math.round(arr[offset + 2])] ?? CONNECTION_TYPES[0],
			biasType,
		});
	}
	return hiddenLayers;
}

function _decodeRewardShaping(s: DecodedScalars, template: Genome): RLGenome["rewardShaping"] {
	return {
		...template.rl.rewardShaping,
		clipMin: Math.min(s.clipMin, s.clipMax - 1e-6),
		clipMax: Math.max(s.clipMax, s.clipMin + 1e-6),
		scaleFactor: s.scaleFactor,
	};
}

function _decodeDiscretePolicy(s: DecodedScalars, template: Genome): RLGenome["discretePolicy"] {
	return {
		...template.rl.discretePolicy,
		epsilonStart: s.epsilonStart,
		epsilonMin: s.epsilonMin,
		epsilonDecay: s.epsilonDecay,
		temperature: s.temperature,
	};
}

function _decodeContinuousPolicy(s: DecodedScalars, template: Genome): RLGenome["continuousPolicy"] {
	return {
		...template.rl.continuousPolicy,
		noiseStd: s.noiseStd,
		noiseDecay: s.noiseDecay,
	};
}

function _decodeRL(s: DecodedScalars, template: Genome): RLGenome {
	return {
		gamma: s.gamma,
		learningRate: s.learningRate,
		rewardShaping: _decodeRewardShaping(s, template),
		horizon: { maxEpisodeLength: s.maxEpisodeLength, nStepReturn: s.nStepReturn, frameSkip: s.frameSkip },
		discretePolicy: _decodeDiscretePolicy(s, template),
		continuousPolicy: _decodeContinuousPolicy(s, template),
		replayBuffer: { ...template.rl.replayBuffer, bufferSize: s.bufferSize, alphaPER: s.alphaPER, betaPER: s.betaPER },
	};
}

function _decodeMutation(s: DecodedScalars, template: Genome): MutationGenome {
	return { ...template.mutation, rate: s.mutationRate, sigma: s.sigma, selfSigma: s.selfSigma };
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	const s = _decodeScalars(vec);
	const hiddenLayers = _decodeLayers(vec, s.depth, template);
	const network: NetworkGenome = {
		inputDim: s.inputDim,
		outputDim: s.outputDim,
		hiddenLayers,
		normalization: template.network.normalization,
	};
	return {
		id: template.id,
		generation: template.generation,
		network,
		rl: _decodeRL(s, template),
		mutation: _decodeMutation(s, template),
		crossover: { ...template.crossover },
		gaControl: { ...template.gaControl },
	};
}

function _computeEncodedDims(templates: Genome[]): number[] {
	return templates.map((t) =>
		SCALAR_DIM + Math.min(t.network.hiddenLayers.length, MAX_DEPTH) * 3
	);
}

function _decodeAll(mat: Float32Array, templates: Genome[], dims: number[]): Genome[] {
	const out: Genome[] = [];
	let offset = 0;
	for (let i = 0; i < templates.length; i++) {
		const vec = mat.subarray(offset, offset + dims[i]);
		out.push(decodeGenome(vec, templates[i]));
		offset += dims[i];
	}
	return out;
}

export function decodePopulation(mat: Float32Array, templates: Genome[]): Genome[] {
	const dims = _computeEncodedDims(templates);
	return _decodeAll(mat, templates, dims);
}
