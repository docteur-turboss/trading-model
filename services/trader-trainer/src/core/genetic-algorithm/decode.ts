import { InitialisationType } from "../neural-network/type";
import { ACTIVATIONS, CONNECTION_TYPES, GenomeEncoding, MAX_DEPTH } from "./encoding-vector";
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

function _decodeScalars(enc: GenomeEncoding): DecodedScalars {
	return {
		gamma: clamp(enc.gamma, 0.8, 0.9999),
		learningRate: clamp(10 ** ((enc.learningRate - 1) * 6), 1e-6, 1e-1),
		clipMin: enc.clipMin,
		clipMax: enc.clipMax,
		scaleFactor: clamp(10 ** ((enc.scaleFactor - 1) * 3), 0.001, 1000),
		maxEpisodeLength: clamp(Math.round(enc.maxEpisodeLength * 2_000), 10, 20_000),
		nStepReturn: clamp(Math.round(enc.nStepReturn * 20), 1, 20),
		frameSkip: clamp(Math.round(enc.frameSkip * 10), 1, 10),
		epsilonStart: clamp(enc.epsilonStart, 0.1, 1.0),
		epsilonMin: clamp(enc.epsilonMin * 0.2, 0.001, 0.2),
		epsilonDecay: clamp(enc.epsilonDecay, 0.9, 0.9999),
		temperature: clamp(10 ** ((enc.temperature - 0.5) * 2), 0.01, 100),
		noiseStd: clamp(enc.noiseStd * 5, 0.001, 5),
		noiseDecay: clamp(enc.noiseDecay, 0.9, 0.9999),
		bufferSize: clamp(Math.round(10 ** (enc.bufferSize * 6)), 100, 1_000_000),
		alphaPER: clamp(enc.alphaPER, 0, 1),
		betaPER: clamp(enc.betaPER, 0, 1),
		mutationRate: clamp(enc.mutationRate * 0.5, 0.001, 0.5),
		sigma: clamp(10 ** ((enc.mutationSigma - 1.25) * 4), 1e-5, 10),
		selfSigma: clamp(10 ** ((enc.mutationSelfSigma - 1.25) * 4), 1e-5, 10),
		inputDim: clamp(Math.round(enc.networkInputDim * 256), 1, 256),
		outputDim: clamp(Math.round(enc.networkOutputDim * 64), 1, 64),
		depth: clamp(Math.round(enc.networkDepth * MAX_DEPTH), 1, MAX_DEPTH),
	};
}

function _decodeLayers(enc: GenomeEncoding, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	for (let i = 0; i < depth && i < enc.layers.length; i++) {
		const layer = enc.layers[i];
		const biasType = template.network.hiddenLayers[i]?.biasType ?? InitialisationType.Zeros;
		hiddenLayers.push({
			neurons: clamp(Math.round(layer.neurons * 512), 1, 512),
			activation: ACTIVATIONS[layer.activationIdx] ?? ACTIVATIONS[0],
			connectionType: CONNECTION_TYPES[layer.connectionTypeIdx] ?? CONNECTION_TYPES[0],
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
	const enc = GenomeEncoding.fromFloat32Array(vec);
	const s = _decodeScalars(enc);
	const hiddenLayers = _decodeLayers(enc, s.depth, template);
	const network: NetworkGenome = {
		inputDim: s.inputDim,
		outputDim: s.outputDim,
		hiddenLayers,
		normalization: template.network.normalization,
	};
	return {
		id: template.id,
		generation: template.generation,
		fitness: template.fitness,
		network,
		rl: _decodeRL(s, template),
		mutation: _decodeMutation(s, template),
		crossover: { ...template.crossover },
		gaControl: { ...template.gaControl },
	};
}

export function decodePopulation(mat: Float32Array, templates: Genome[]): Genome[] {
	const length = templates.length;
	const out: Genome[] = [];
	const encodings: GenomeEncoding[] = [];
	let offset = 0;
	for (let i = 0; i < length; i++) {
		const enc = GenomeEncoding.fromFloat32Array(mat.subarray(offset));
		encodings.push(enc);
		offset += enc.length;
	}
	for (let i = 0; i < length; i++) {
		const s = _decodeScalars(encodings[i]);
		const hiddenLayers = _decodeLayers(encodings[i], s.depth, templates[i]);
		const network: NetworkGenome = {
			inputDim: s.inputDim,
			outputDim: s.outputDim,
			hiddenLayers,
			normalization: templates[i].network.normalization,
		};
		out.push({
			id: templates[i].id,
			generation: templates[i].generation,
			fitness: templates[i].fitness,
			network,
			rl: _decodeRL(s, templates[i]),
			mutation: _decodeMutation(s, templates[i]),
			crossover: { ...templates[i].crossover },
			gaControl: { ...templates[i].gaControl },
		});
	}
	return out;
}
