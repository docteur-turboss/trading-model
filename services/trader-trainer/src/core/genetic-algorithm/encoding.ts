// ================================================================
//  encoding.ts — compact vectorised genome representation
// ================================================================
//
//  Layout of the encoded Float32Array (fixed-length prefix + variable layers):
//
//  [0]       rl.gamma
//  [1]       rl.learningRate (log-scaled: log10(lr))
//  [2]       rl.rewardShaping.clipMin
//  [3]       rl.rewardShaping.clipMax
//  [4]       rl.rewardShaping.scaleFactor
//  [5]       rl.horizon.maxEpisodeLength (normalised ÷ 2000)
//  [6]       rl.horizon.nStepReturn      (normalised ÷ 20)
//  [7]       rl.horizon.frameSkip        (normalised ÷ 10)
//  [8]       rl.discretePolicy.epsilonStart
//  [9]       rl.discretePolicy.epsilonMin
//  [10]      rl.discretePolicy.epsilonDecay
//  [11]      rl.discretePolicy.temperature  (log-scaled: log10)
//  [12]      rl.continuousPolicy.noiseStd
//  [13]      rl.continuousPolicy.noiseDecay
//  [14]      rl.replayBuffer.bufferSize     (log-scaled: log10 ÷ 6)
//  [15]      rl.replayBuffer.alphaPER
//  [16]      rl.replayBuffer.betaPER
//  [17]      mutation.rate
//  [18]      mutation.sigma                 (log-scaled: log10)
//  [19]      mutation.selfSigma             (log-scaled: log10)
//  [20]      network.inputDim   (normalised ÷ 256)
//  [21]      network.outputDim  (normalised ÷ 64)
//  [22]      network depth (hidden layers ÷ MAX_DEPTH)
//  [23 .. 23 + MAX_DEPTH - 1]   neurons per layer (normalised ÷ 512), zero-padded
//  [23 + MAX_DEPTH .. 23 + MAX_DEPTH * (1 + N_ACT + N_CT) - 1]
//             per-layer one-hot(activation) + one-hot(connectionType), zero-padded
//
//  Total length = SCALAR_DIM + MAX_DEPTH * (1 + N_ACTIVATIONS + N_CONNECTION_TYPES)
//
// ================================================================

import type {
	ActivationType,
	ConnectionType,
	Genome,
	MutationGenome,
	NetworkGenome,
	RLGenome,
} from "./genome-types";
import { clamp } from "./utils";

// ---- Constants ----

const MAX_DEPTH = 12; // maximum layers we encode

const ACTIVATIONS: ActivationType[] = [
	"relu",
	"sigmoid",
	"tanh",
	"leakyReLu",
	"elu",
	"mish",
	"gelu",
	"softmax",
];
const CONNECTION_TYPES: ConnectionType[] = [
	"dense-skip",
	"fully-connected",
	"residual-connection",
];

const N_ACT = ACTIVATIONS.length; // 8
const N_CT = CONNECTION_TYPES.length; // 3
const SCALAR_DIM = 23; // scalars before per-layer section
const LAYER_DIM = 1 + N_ACT + N_CT; // neurons + one-hots per layer slot

/** Total encoded vector length */
export const ENCODED_DIM = SCALAR_DIM + MAX_DEPTH * LAYER_DIM;

// ----------------------------------------------------------------
// encodeGenome
// ----------------------------------------------------------------

/**
 * Encode a Genome into a fixed-length Float32Array.
 *
 * All values are normalised to approximately [0, 1] or [-1, 1].
 * One-hot categorical dimensions are exactly {0, 1}.
 *
 * Layers beyond MAX_DEPTH are silently ignored.
 * Absent layer slots are zero-padded (effectively "no layer").
 */
export function encodeGenome(genome: Genome): Float32Array {
	const vec = new Float32Array(ENCODED_DIM);
	_encodeScalars(vec, genome);
	_encodeLayers(vec, genome.network);
	return vec;
}

function _encodeScalars(vec: Float32Array, genome: Genome): void {
	const rl = genome.rl;
	const net = genome.network;

	vec[0] = rl.gamma;
	vec[1] = Math.log10(Math.max(1e-6, rl.learningRate)) / 6 + 1;
	vec[2] = rl.rewardShaping.clipMin;
	vec[3] = rl.rewardShaping.clipMax;
	vec[4] = Math.log10(Math.max(0.001, rl.rewardShaping.scaleFactor)) / 3 + 1;
	vec[5] = rl.horizon.maxEpisodeLength / 2_000;
	vec[6] = rl.horizon.nStepReturn / 20;
	vec[7] = rl.horizon.frameSkip / 10;
	vec[8] = rl.discretePolicy.epsilonStart;
	vec[9] = rl.discretePolicy.epsilonMin / 0.2;
	vec[10] = rl.discretePolicy.epsilonDecay;
	vec[11] = Math.log10(Math.max(0.01, rl.discretePolicy.temperature)) / 2 + 0.5;
	vec[12] = rl.continuousPolicy.noiseStd / 5;
	vec[13] = rl.continuousPolicy.noiseDecay;
	vec[14] = Math.log10(Math.max(100, rl.replayBuffer.bufferSize)) / 6;
	vec[15] = rl.replayBuffer.alphaPER;
	vec[16] = rl.replayBuffer.betaPER;
	vec[17] = genome.mutation.rate / 0.5;
	vec[18] = Math.log10(Math.max(1e-5, genome.mutation.sigma)) / 4 + 1.25;
	vec[19] = Math.log10(Math.max(1e-5, genome.mutation.selfSigma)) / 4 + 1.25;
	vec[20] = net.inputDim / 256;
	vec[21] = net.outputDim / 64;
	vec[22] = net.hiddenLayers.length / MAX_DEPTH;
}

function _encodeLayers(vec: Float32Array, net: Genome["network"]): void {
	const layerOffset = SCALAR_DIM;
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);

	for (let i = 0; i < MAX_DEPTH; i++) {
		const base = layerOffset + i * LAYER_DIM;
		if (i >= layers.length) {
			continue;
		}
		const layer = layers[i];

		vec[base] = layer.neurons / 512;

		const actIdx = ACTIVATIONS.indexOf(layer.activation);
		if (actIdx >= 0) {
			vec[base + 1 + actIdx] = 1;
		}

		const ctIdx = CONNECTION_TYPES.indexOf(layer.connectionType);
		if (ctIdx >= 0) {
			vec[base + 1 + N_ACT + ctIdx] = 1;
		}
	}
}

// ----------------------------------------------------------------
// decodeGenome
// ----------------------------------------------------------------

function argmax(arr: Float32Array, start: number, len: number): number {
	let best = start;
	for (let i = start + 1; i < start + len; i++) {
		if (arr[i] > arr[best]) {
			best = i;
		}
	}
	return best - start;
}

function decodeScalars(vec: Float32Array) {
	return {
		gamma: clamp(vec[0], 0.8, 0.9999),
		learningRate: clamp(10 ** ((vec[1] - 1) * 6), 1e-6, 1e-1),
		clipMin: vec[2],
		clipMax: vec[3],
		scaleFactor: clamp(10 ** ((vec[4] - 1) * 3), 0.001, 1000),
		maxEpisodeLength: clamp(Math.round(vec[5] * 2_000), 10, 20_000),
		nStepReturn: clamp(Math.round(vec[6] * 20), 1, 20),
		frameSkip: clamp(Math.round(vec[7] * 10), 1, 10),
		epsilonStart: clamp(vec[8], 0.1, 1.0),
		epsilonMin: clamp(vec[9] * 0.2, 0.001, 0.2),
		epsilonDecay: clamp(vec[10], 0.9, 0.9999),
		temperature: clamp(10 ** ((vec[11] - 0.5) * 2), 0.01, 100),
		noiseStd: clamp(vec[12] * 5, 0.001, 5),
		noiseDecay: clamp(vec[13], 0.9, 0.9999),
		bufferSize: clamp(Math.round(10 ** (vec[14] * 6)), 100, 1_000_000),
		alphaPER: clamp(vec[15], 0, 1),
		betaPER: clamp(vec[16], 0, 1),
		mutationRate: clamp(vec[17] * 0.5, 0.001, 0.5),
		sigma: clamp(10 ** ((vec[18] - 1.25) * 4), 1e-5, 10),
		selfSigma: clamp(10 ** ((vec[19] - 1.25) * 4), 1e-5, 10),
		inputDim: clamp(Math.round(vec[20] * 256), 1, 256),
		outputDim: clamp(Math.round(vec[21] * 64), 1, 64),
		depth: clamp(Math.round(vec[22] * MAX_DEPTH), 1, MAX_DEPTH),
	};
}

function decodeLayers(vec: Float32Array, depth: number, template: Genome) {
	const hiddenLayers: Genome["network"]["hiddenLayers"] = [];
	const layerOffset = SCALAR_DIM;

	for (let i = 0; i < depth; i++) {
		const base = layerOffset + i * LAYER_DIM;
		const neurons = clamp(Math.round(vec[base] * 512), 1, 512);
		const actIdx = argmax(vec, base + 1, N_ACT);
		const ctIdx = argmax(vec, base + 1 + N_ACT, N_CT);

		hiddenLayers.push({
			neurons,
			activation: ACTIVATIONS[actIdx],
			connectionType: CONNECTION_TYPES[ctIdx],
			biasType: template.network.hiddenLayers[i]?.biasType ?? "zeros",
		});
	}
	return hiddenLayers;
}

/**
 * Reconstruct a Genome from its encoded vector.
 *
 * A `template` genome provides identity/meta fields (id, generation,
 * crossover, gaControl) that are not encoded in the vector.
 *
 * Decoded numeric values are clamped to valid ranges.
 * Categorical fields are resolved by argmax of the one-hot block;
 * ties are broken by index order.
 */
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

function decodeRL(scalars: Record<string, number>, template: Genome): RLGenome {
	return {
		gamma: scalars.gamma,
		learningRate: scalars.learningRate,
		rewardShaping: {
			...template.rl.rewardShaping,
			clipMin: Math.min(scalars.clipMin, scalars.clipMax - 1e-6),
			clipMax: Math.max(scalars.clipMax, scalars.clipMin + 1e-6),
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
			clipMin: template.rl.continuousPolicy.clipMin,
			clipMax: template.rl.continuousPolicy.clipMax,
		},
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

export function decodeGenome(vec: Float32Array, template: Genome): Genome {
	if (vec.length !== ENCODED_DIM) {
		throw new Error(
			`decodeGenome: expected vector of length ${ENCODED_DIM}, got ${vec.length}`
		);
	}

	const scalars = decodeScalars(vec);
	const hiddenLayers = decodeLayers(vec, scalars.depth, template);

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

// ----------------------------------------------------------------
// Batch helpers (useful for CMA-ES or vectorised GA loops)
// ----------------------------------------------------------------

/**
 * Encode a full population into a 2-D Float32Array matrix.
 * Row i = encodeGenome(population[i]).
 */
export function encodePopulation(population: Genome[]): Float32Array {
	const length = population.length;
	const mat = new Float32Array(length * ENCODED_DIM);
	for (let i = 0; i < length; i++) {
		mat.set(encodeGenome(population[i]), i * ENCODED_DIM);
	}
	return mat;
}

/**
 * Decode a flat matrix back to an array of genomes.
 * `templates` must be parallel to the rows of `mat`.
 */
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
