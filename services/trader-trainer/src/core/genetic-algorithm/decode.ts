import { InitialisationType } from "../neural-network/type";
import { createBounded } from "./bounded";
import {
	activationFromIndex,
	connectionTypeFromIndex,
	encodedDim,
	layerOffset,
	MAX_DEPTH,
	readEncodedLayer,
	readScalar,
} from "./encoding-indices";
import type {
	Genome,
	MutationGenome,
	NetworkGenome,
	RLGenome,
} from "./genome-types";
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
		gamma: clamp(readScalar(arr, "Gamma"), 0.8, 0.9999),
		learningRate: clamp(
			10 ** ((readScalar(arr, "LearningRate") - 1) * 6),
			1e-6,
			1e-1
		),
		rewardShaping: {
			clipMin: readScalar(arr, "ClipMin"),
			clipMax: readScalar(arr, "ClipMax"),
			scaleFactor: clamp(
				10 ** ((readScalar(arr, "ScaleFactor") - 1) * 3),
				0.001,
				1000
			),
		},
		horizon: {
			maxEpisodeLength: clamp(
				Math.round(readScalar(arr, "MaxEpisodeLength") * 2_000),
				10,
				20_000
			),
			nStepReturn: clamp(
				Math.round(readScalar(arr, "NStepReturn") * 20),
				1,
				20
			),
			frameSkip: clamp(Math.round(readScalar(arr, "FrameSkip") * 10), 1, 10),
		},
		discretePolicy: {
			epsilonStart: clamp(readScalar(arr, "EpsilonStart"), 0.1, 1.0),
			epsilonMin: clamp(readScalar(arr, "EpsilonMin") * 0.2, 0.001, 0.2),
			epsilonDecay: clamp(readScalar(arr, "EpsilonDecay"), 0.9, 0.9999),
			temperature: clamp(
				10 ** ((readScalar(arr, "Temperature") - 0.5) * 2),
				0.01,
				100
			),
		},
		continuousPolicy: {
			noiseStd: clamp(readScalar(arr, "NoiseStd") * 5, 0.001, 5),
			noiseDecay: clamp(readScalar(arr, "NoiseDecay"), 0.9, 0.9999),
		},
		replayBuffer: {
			bufferSize: clamp(
				Math.round(10 ** (readScalar(arr, "BufferSize") * 6)),
				100,
				1_000_000
			),
			alphaPER: clamp(readScalar(arr, "AlphaPER"), 0, 1),
			betaPER: clamp(readScalar(arr, "BetaPER"), 0, 1),
		},
		mutation: {
			rate: clamp(readScalar(arr, "MutationRate") * 0.5, 0.001, 0.5),
			sigma: clamp(
				10 ** ((readScalar(arr, "MutationSigma") - 1.25) * 4),
				1e-5,
				10
			),
			selfSigma: clamp(
				10 ** ((readScalar(arr, "MutationSelfSigma") - 1.25) * 4),
				1e-5,
				10
			),
		},
		network: {
			inputDim: clamp(
				Math.round(readScalar(arr, "NetworkInputDim") * 256),
				1,
				256
			),
			outputDim: clamp(
				Math.round(readScalar(arr, "NetworkOutputDim") * 64),
				1,
				64
			),
			depth: clamp(
				Math.round(readScalar(arr, "NetworkDepth") * MAX_DEPTH),
				1,
				MAX_DEPTH
			),
		},
	};
}

function _decodeLayers(arr: Float32Array, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth; i++) {
		const enc = readEncodedLayer(arr, layerOffset(i));
		const biasType =
			template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(enc.neurons * 512), 1, 512),
			activation: activationFromIndex(enc.activationIdx),
			connectionType: connectionTypeFromIndex(enc.connectionTypeIdx),
			biasType,
		});
	}
	return hiddenLayers;
}

function _decodeRewardShaping(
	scalars: DecodedScalars,
	template: Genome
): RLGenome["rewardShaping"] {
	return {
		...template.rl.rewardShaping,
		clipBounds: createBounded(
			Math.min(
				scalars.rewardShaping.clipMin,
				scalars.rewardShaping.clipMax - 1e-6
			),
			Math.max(
				scalars.rewardShaping.clipMax,
				scalars.rewardShaping.clipMin + 1e-6
			)
		),
		scaleFactor: scalars.rewardShaping.scaleFactor,
	};
}

function _decodeDiscretePolicy(
	scalars: DecodedScalars,
	template: Genome
): RLGenome["discretePolicy"] {
	return {
		...template.rl.discretePolicy,
		epsilonStart: scalars.discretePolicy.epsilonStart,
		epsilonMin: scalars.discretePolicy.epsilonMin,
		epsilonDecay: scalars.discretePolicy.epsilonDecay,
		temperature: scalars.discretePolicy.temperature,
	};
}

function _decodeContinuousPolicy(
	scalars: DecodedScalars,
	template: Genome
): RLGenome["continuousPolicy"] {
	return {
		...template.rl.continuousPolicy,
		noiseStd: scalars.continuousPolicy.noiseStd,
		noiseDecay: scalars.continuousPolicy.noiseDecay,
	};
}

function _decodeRL(scalars: DecodedScalars, template: Genome): RLGenome {
	return {
		gamma: scalars.gamma,
		learningRate: scalars.learningRate,
		rewardShaping: _decodeRewardShaping(scalars, template),
		horizon: scalars.horizon,
		discretePolicy: _decodeDiscretePolicy(scalars, template),
		continuousPolicy: _decodeContinuousPolicy(scalars, template),
		replayBuffer: { ...template.rl.replayBuffer, ...scalars.replayBuffer },
	};
}

function _decodeMutation(
	scalars: DecodedScalars,
	template: Genome
): MutationGenome {
	return { ...template.mutation, ...scalars.mutation };
}

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	const scalars = _decodeScalars(vec);
	const hiddenLayers = _decodeLayers(vec, scalars.network.depth, template);
	const network: NetworkGenome = {
		inputDim: scalars.network.inputDim,
		outputDim: scalars.network.outputDim,
		hiddenLayers,
		normalization: template.network.normalization,
	};
	return {
		id: template.id,
		generation: template.generation,
		network,
		rl: _decodeRL(scalars, template),
		mutation: _decodeMutation(scalars, template),
		crossover: { ...template.crossover },
		gaControl: { ...template.gaControl },
	};
}

function _computeEncodedDims(templates: Genome[]): number[] {
	return templates.map((tmpl) =>
		encodedDim(Math.min(tmpl.network.hiddenLayers.length, MAX_DEPTH))
	);
}

function _decodeAll(
	mat: Float32Array,
	templates: Genome[],
	dims: number[]
): Genome[] {
	const out: Genome[] = [];
	let offset = 0;
	for (let i = 0; i < templates.length; i++) {
		const vec = mat.subarray(offset, offset + dims[i]);
		out.push(decodeGenome(vec, templates[i]));
		offset += dims[i];
	}
	return out;
}

export function decodePopulation(
	mat: Float32Array,
	templates: Genome[]
): Genome[] {
	const dims = _computeEncodedDims(templates);
	return _decodeAll(mat, templates, dims);
}
