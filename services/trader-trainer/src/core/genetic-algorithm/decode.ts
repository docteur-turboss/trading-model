import { InitialisationType } from "../neural-network/type";
import { ACTIVATIONS, CONNECTION_TYPES, MAX_DEPTH, ENCODING_OFFSETS, encodedDim, layerOffset, readEncodedLayer } from "./encoding-indices";
import type { Genome, MutationGenome, NetworkGenome, RLGenome } from "./genome-types";
import { createBounded } from "./bounded";
import { clamp } from "./utils";

interface DecodedRewardShaping {
	clipMin: number;
	clipMax: number;
	scaleFactor: number;
}

interface DecodedHorizon {
	maxEpisodeLength: number;
	nStepReturn: number;
	frameSkip: number;
}

interface DecodedDiscretePolicy {
	epsilonStart: number;
	epsilonMin: number;
	epsilonDecay: number;
	temperature: number;
}

interface DecodedContinuousPolicy {
	noiseStd: number;
	noiseDecay: number;
}

interface DecodedReplayBuffer {
	bufferSize: number;
	alphaPER: number;
	betaPER: number;
}

interface DecodedMutation {
	rate: number;
	sigma: number;
	selfSigma: number;
}

interface DecodedNetwork {
	inputDim: number;
	outputDim: number;
	depth: number;
}

interface DecodedScalars {
	gamma: number;
	learningRate: number;
	rewardShaping: DecodedRewardShaping;
	horizon: DecodedHorizon;
	discretePolicy: DecodedDiscretePolicy;
	continuousPolicy: DecodedContinuousPolicy;
	replayBuffer: DecodedReplayBuffer;
	mutation: DecodedMutation;
	network: DecodedNetwork;
}

function _decodeScalars(arr: Float32Array): DecodedScalars {
	return {
		gamma: clamp(arr[ENCODING_OFFSETS.Gamma], 0.8, 0.9999),
		learningRate: clamp(10 ** ((arr[ENCODING_OFFSETS.LearningRate] - 1) * 6), 1e-6, 1e-1),
		rewardShaping: {
			clipMin: arr[ENCODING_OFFSETS.ClipMin],
			clipMax: arr[ENCODING_OFFSETS.ClipMax],
			scaleFactor: clamp(10 ** ((arr[ENCODING_OFFSETS.ScaleFactor] - 1) * 3), 0.001, 1000),
		},
		horizon: {
			maxEpisodeLength: clamp(Math.round(arr[ENCODING_OFFSETS.MaxEpisodeLength] * 2_000), 10, 20_000),
			nStepReturn: clamp(Math.round(arr[ENCODING_OFFSETS.NStepReturn] * 20), 1, 20),
			frameSkip: clamp(Math.round(arr[ENCODING_OFFSETS.FrameSkip] * 10), 1, 10),
		},
		discretePolicy: {
			epsilonStart: clamp(arr[ENCODING_OFFSETS.EpsilonStart], 0.1, 1.0),
			epsilonMin: clamp(arr[ENCODING_OFFSETS.EpsilonMin] * 0.2, 0.001, 0.2),
			epsilonDecay: clamp(arr[ENCODING_OFFSETS.EpsilonDecay], 0.9, 0.9999),
			temperature: clamp(10 ** ((arr[ENCODING_OFFSETS.Temperature] - 0.5) * 2), 0.01, 100),
		},
		continuousPolicy: {
			noiseStd: clamp(arr[ENCODING_OFFSETS.NoiseStd] * 5, 0.001, 5),
			noiseDecay: clamp(arr[ENCODING_OFFSETS.NoiseDecay], 0.9, 0.9999),
		},
		replayBuffer: {
			bufferSize: clamp(Math.round(10 ** (arr[ENCODING_OFFSETS.BufferSize] * 6)), 100, 1_000_000),
			alphaPER: clamp(arr[ENCODING_OFFSETS.AlphaPER], 0, 1),
			betaPER: clamp(arr[ENCODING_OFFSETS.BetaPER], 0, 1),
		},
		mutation: {
			rate: clamp(arr[ENCODING_OFFSETS.MutationRate] * 0.5, 0.001, 0.5),
			sigma: clamp(10 ** ((arr[ENCODING_OFFSETS.MutationSigma] - 1.25) * 4), 1e-5, 10),
			selfSigma: clamp(10 ** ((arr[ENCODING_OFFSETS.MutationSelfSigma] - 1.25) * 4), 1e-5, 10),
		},
		network: {
			inputDim: clamp(Math.round(arr[ENCODING_OFFSETS.NetworkInputDim] * 256), 1, 256),
			outputDim: clamp(Math.round(arr[ENCODING_OFFSETS.NetworkOutputDim] * 64), 1, 64),
			depth: clamp(Math.round(arr[ENCODING_OFFSETS.NetworkDepth] * MAX_DEPTH), 1, MAX_DEPTH),
		},
	};
}

function _decodeLayers(arr: Float32Array, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth; i++) {
		const enc = readEncodedLayer(arr, layerOffset(i));
		const biasType = template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(enc.neurons * 512), 1, 512),
			activation: ACTIVATIONS[enc.activationIdx] ?? ACTIVATIONS[0],
			connectionType: CONNECTION_TYPES[enc.connectionTypeIdx] ?? CONNECTION_TYPES[0],
			biasType,
		});
	}
	return hiddenLayers;
}

function _decodeRewardShaping(s: DecodedScalars, template: Genome): RLGenome["rewardShaping"] {
	return {
		...template.rl.rewardShaping,
		clipBounds: createBounded(
			Math.min(s.rewardShaping.clipMin, s.rewardShaping.clipMax - 1e-6),
			Math.max(s.rewardShaping.clipMax, s.rewardShaping.clipMin + 1e-6),
		),
		scaleFactor: s.rewardShaping.scaleFactor,
	};
}

function _decodeDiscretePolicy(s: DecodedScalars, template: Genome): RLGenome["discretePolicy"] {
	return {
		...template.rl.discretePolicy,
		epsilonStart: s.discretePolicy.epsilonStart,
		epsilonMin: s.discretePolicy.epsilonMin,
		epsilonDecay: s.discretePolicy.epsilonDecay,
		temperature: s.discretePolicy.temperature,
	};
}

function _decodeContinuousPolicy(s: DecodedScalars, template: Genome): RLGenome["continuousPolicy"] {
	return {
		...template.rl.continuousPolicy,
		noiseStd: s.continuousPolicy.noiseStd,
		noiseDecay: s.continuousPolicy.noiseDecay,
	};
}

function _decodeRL(s: DecodedScalars, template: Genome): RLGenome {
	return {
		gamma: s.gamma,
		learningRate: s.learningRate,
		rewardShaping: _decodeRewardShaping(s, template),
		horizon: s.horizon,
		discretePolicy: _decodeDiscretePolicy(s, template),
		continuousPolicy: _decodeContinuousPolicy(s, template),
		replayBuffer: { ...template.rl.replayBuffer, ...s.replayBuffer },
	};
}

function _decodeMutation(s: DecodedScalars, template: Genome): MutationGenome {
	return { ...template.mutation, ...s.mutation };
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	const s = _decodeScalars(vec);
	const hiddenLayers = _decodeLayers(vec, s.network.depth, template);
	const network: NetworkGenome = {
		inputDim: s.network.inputDim,
		outputDim: s.network.outputDim,
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
		encodedDim(Math.min(t.network.hiddenLayers.length, MAX_DEPTH))
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
