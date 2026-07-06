import {
	InitialisationType,
} from "../neural-network/type";
import type {
	Genome,
	MutationGenome,
	NetworkGenome,
	RLGenome,
} from "./genome-types";
import { clamp } from "./utils";
import { EncodingIndex, SCALAR_DIM } from "./encoding-indices";
import {
	ACTIVATIONS,
	CONNECTION_TYPES,
	ENCODED_DIM,
	LAYER_DIM,
	MAX_DEPTH,
	N_ACT,
	N_CT,
} from "./encoding-constants";

function argmax(arr: Float32Array, start: number, len: number): number {
	let best = start;
	for (let i = start + 1; i < start + len; i++) {
		if (arr[i] > arr[best]) {
			best = i;
		}
	}
	return best - start;
}

function _decodeRLScalars(vec: Float32Array) {
	return {
		gamma: clamp(vec[EncodingIndex.Gamma], 0.8, 0.9999),
		learningRate: clamp(10 ** ((vec[EncodingIndex.LearningRate] - 1) * 6), 1e-6, 1e-1),
		clipMin: vec[EncodingIndex.ClipMin],
		clipMax: vec[EncodingIndex.ClipMax],
		scaleFactor: clamp(10 ** ((vec[EncodingIndex.ScaleFactor] - 1) * 3), 0.001, 1000),
		maxEpisodeLength: clamp(Math.round(vec[EncodingIndex.MaxEpisodeLength] * 2_000), 10, 20_000),
		nStepReturn: clamp(Math.round(vec[EncodingIndex.NStepReturn] * 20), 1, 20),
		frameSkip: clamp(Math.round(vec[EncodingIndex.FrameSkip] * 10), 1, 10),
		epsilonStart: clamp(vec[EncodingIndex.EpsilonStart], 0.1, 1.0),
		epsilonMin: clamp(vec[EncodingIndex.EpsilonMin] * 0.2, 0.001, 0.2),
		epsilonDecay: clamp(vec[EncodingIndex.EpsilonDecay], 0.9, 0.9999),
		temperature: clamp(10 ** ((vec[EncodingIndex.Temperature] - 0.5) * 2), 0.01, 100),
		noiseStd: clamp(vec[EncodingIndex.NoiseStd] * 5, 0.001, 5),
		noiseDecay: clamp(vec[EncodingIndex.NoiseDecay], 0.9, 0.9999),
		bufferSize: clamp(Math.round(10 ** (vec[EncodingIndex.BufferSize] * 6)), 100, 1_000_000),
		alphaPER: clamp(vec[EncodingIndex.AlphaPER], 0, 1),
		betaPER: clamp(vec[EncodingIndex.BetaPER], 0, 1),
	};
}

function _decodeMutationScalars(vec: Float32Array) {
	return {
		mutationRate: clamp(vec[EncodingIndex.MutationRate] * 0.5, 0.001, 0.5),
		sigma: clamp(10 ** ((vec[EncodingIndex.MutationSigma] - 1.25) * 4), 1e-5, 10),
		selfSigma: clamp(10 ** ((vec[EncodingIndex.MutationSelfSigma] - 1.25) * 4), 1e-5, 10),
	};
}

function _decodeNetworkScalars(vec: Float32Array) {
	return {
		inputDim: clamp(Math.round(vec[EncodingIndex.NetworkInputDim] * 256), 1, 256),
		outputDim: clamp(Math.round(vec[EncodingIndex.NetworkOutputDim] * 64), 1, 64),
		depth: clamp(Math.round(vec[EncodingIndex.NetworkDepth] * MAX_DEPTH), 1, MAX_DEPTH),
	};
}

function decodeScalars(vec: Float32Array) {
	return {
		..._decodeRLScalars(vec),
		..._decodeMutationScalars(vec),
		..._decodeNetworkScalars(vec),
	};
}

function _decodeSingleLayer(
	vec: Float32Array,
	base: number,
	biasType: Genome["network"]["hiddenLayers"][number]["biasType"]
): Genome["network"]["hiddenLayers"][number] {
	return {
		neurons: clamp(Math.round(vec[base] * 512), 1, 512),
		activation: ACTIVATIONS[argmax(vec, base + 1, N_ACT)],
		connectionType: CONNECTION_TYPES[argmax(vec, base + 1 + N_ACT, N_CT)],
		biasType,
	};
}

function decodeLayers(vec: Float32Array, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];

	for (let i = 0; i < depth; i++) {
		const biasType = template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push(_decodeSingleLayer(vec, SCALAR_DIM + i * LAYER_DIM, biasType));
	}
	return hiddenLayers;
}

function decodeNetwork(
	scalars: Record<string, number>,
	hiddenLayers: NetworkGenome["hiddenLayers"],
	template: Genome
): NetworkGenome {
	return {
		inputDim: scalars.inputDim,
		outputDim: scalars.outputDim,
		hiddenLayers,
		normalization: template.network.normalization,
	};
}

function _decodeRewardShaping(
	scalars: Record<string, number>,
	template: Genome
): RLGenome["rewardShaping"] {
	return {
		...template.rl.rewardShaping,
		clipMin: Math.min(scalars.clipMin, scalars.clipMax - 1e-6),
		clipMax: Math.max(scalars.clipMax, scalars.clipMin + 1e-6),
		scaleFactor: scalars.scaleFactor,
	};
}

function _decodeDiscretePolicy(
	scalars: Record<string, number>,
	template: Genome
): RLGenome["discretePolicy"] {
	return {
		...template.rl.discretePolicy,
		epsilonStart: scalars.epsilonStart,
		epsilonMin: scalars.epsilonMin,
		epsilonDecay: scalars.epsilonDecay,
		temperature: scalars.temperature,
	};
}

function _decodeContinuousPolicy(
	scalars: Record<string, number>,
	template: Genome
): RLGenome["continuousPolicy"] {
	return {
		...template.rl.continuousPolicy,
		noiseStd: scalars.noiseStd,
		noiseDecay: scalars.noiseDecay,
		clipMin: template.rl.continuousPolicy.clipMin,
		clipMax: template.rl.continuousPolicy.clipMax,
	};
}

function decodeRL(scalars: Record<string, number>, template: Genome): RLGenome {
	return {
		gamma: scalars.gamma,
		learningRate: scalars.learningRate,
		rewardShaping: _decodeRewardShaping(scalars, template),
		horizon: {
			maxEpisodeLength: scalars.maxEpisodeLength,
			nStepReturn: scalars.nStepReturn,
			frameSkip: scalars.frameSkip,
		},
		discretePolicy: _decodeDiscretePolicy(scalars, template),
		continuousPolicy: _decodeContinuousPolicy(scalars, template),
		replayBuffer: {
			...template.rl.replayBuffer,
			bufferSize: scalars.bufferSize,
			alphaPER: scalars.alphaPER,
			betaPER: scalars.betaPER,
		},
	};
}

function decodeMutation(
	scalars: Record<string, number>,
	template: Genome
): MutationGenome {
	return {
		...template.mutation,
		rate: scalars.mutationRate,
		sigma: scalars.sigma,
		selfSigma: scalars.selfSigma,
	};
}

function _validateVectorLength(vec: Float32Array): void {
	if (vec.length !== ENCODED_DIM) {
		throw new Error(
			`decodeGenome: expected vector of length ${ENCODED_DIM}, got ${vec.length}`
		);
	}
}

function _buildDecodedGenome(
	scalars: Record<string, number>,
	hiddenLayers: NetworkGenome["hiddenLayers"],
	template: Genome
): Genome {
	return {
		id: template.id,
		generation: template.generation,
		fitness: template.fitness,
		network: decodeNetwork(scalars, hiddenLayers, template),
		rl: decodeRL(scalars, template),
		mutation: decodeMutation(scalars, template),
		crossover: { ...template.crossover },
		gaControl: { ...template.gaControl },
	};
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	_validateVectorLength(vec);
	const scalars = decodeScalars(vec);
	return _buildDecodedGenome(scalars, decodeLayers(vec, scalars.depth, template), template);
}

export function decodePopulation(
	mat: Float32Array,
	templates: Genome[]
): Genome[] {
	const length = templates.length;
	const out: Genome[] = [];
	for (let i = 0; i < length; i++) {
		const row = mat.subarray(
			i * ENCODED_DIM,
			(i + 1) * ENCODED_DIM
		) as Float32Array;
		out.push(decodeGenome(row, templates[i]));
	}
	return out;
}
