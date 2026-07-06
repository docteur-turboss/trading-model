import type { Genome } from "./genome-types";
import { SCALAR_DIM, EncodingVector } from "./encoding-vector";
import {
	ACTIVATIONS,
	CONNECTION_TYPES,
	ENCODED_DIM,
	LAYER_DIM,
	MAX_DEPTH,
	N_ACT,
	N_CT,
} from "./encoding-constants";

function _encodeRLScalars(vec: EncodingVector, rl: Genome["rl"]): void {
	vec.gamma = rl.gamma;
	vec.learningRate = Math.log10(Math.max(1e-6, rl.learningRate)) / 6 + 1;
	vec.clipMin = rl.rewardShaping.clipMin;
	vec.clipMax = rl.rewardShaping.clipMax;
	vec.scaleFactor = Math.log10(Math.max(0.001, rl.rewardShaping.scaleFactor)) / 3 + 1;
	vec.maxEpisodeLength = rl.horizon.maxEpisodeLength / 2_000;
	vec.nStepReturn = rl.horizon.nStepReturn / 20;
	vec.frameSkip = rl.horizon.frameSkip / 10;
	vec.epsilonStart = rl.discretePolicy.epsilonStart;
	vec.epsilonMin = rl.discretePolicy.epsilonMin / 0.2;
	vec.epsilonDecay = rl.discretePolicy.epsilonDecay;
	vec.temperature = Math.log10(Math.max(0.01, rl.discretePolicy.temperature)) / 2 + 0.5;
	vec.noiseStd = rl.continuousPolicy.noiseStd / 5;
	vec.noiseDecay = rl.continuousPolicy.noiseDecay;
	vec.bufferSize = Math.log10(Math.max(100, rl.replayBuffer.bufferSize)) / 6;
	vec.alphaPER = rl.replayBuffer.alphaPER;
	vec.betaPER = rl.replayBuffer.betaPER;
}

function _encodeMutationScalars(vec: EncodingVector, mutation: Genome["mutation"]): void {
	vec.mutationRate = mutation.rate / 0.5;
	vec.mutationSigma = Math.log10(Math.max(1e-5, mutation.sigma)) / 4 + 1.25;
	vec.mutationSelfSigma = Math.log10(Math.max(1e-5, mutation.selfSigma)) / 4 + 1.25;
}

function _encodeNetworkScalars(vec: EncodingVector, net: Genome["network"]): void {
	vec.networkInputDim = net.inputDim / 256;
	vec.networkOutputDim = net.outputDim / 64;
	vec.networkDepth = net.hiddenLayers.length / MAX_DEPTH;
}

function _encodeScalars(vec: EncodingVector, genome: Genome): void {
	_encodeRLScalars(vec, genome.rl);
	_encodeMutationScalars(vec, genome.mutation);
	_encodeNetworkScalars(vec, genome.network);
}

function _encodeSingleLayer(vec: EncodingVector, base: number, layer: Genome["network"]["hiddenLayers"][number]): void {
	vec.data[base] = layer.neurons / 512;

	const actIdx = ACTIVATIONS.indexOf(layer.activation);
	if (actIdx >= 0) {
		vec.data[base + 1 + actIdx] = 1;
	}

	const ctIdx = CONNECTION_TYPES.indexOf(layer.connectionType);
	if (ctIdx >= 0) {
		vec.data[base + 1 + N_ACT + ctIdx] = 1;
	}
}

function _encodeLayers(vec: EncodingVector, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);

	for (let i = 0; i < MAX_DEPTH; i++) {
		if (i >= layers.length) {
			continue;
		}
		_encodeSingleLayer(vec, SCALAR_DIM + i * LAYER_DIM, layers[i]);
	}
}

export function encodeGenome(genome: Genome): EncodingVector {
	const vec = new EncodingVector(ENCODED_DIM);
	_encodeScalars(vec, genome);
	_encodeLayers(vec, genome.network);
	return vec;
}

export function encodePopulation(population: Genome[]): Float32Array {
	const length = population.length;
	const mat = new Float32Array(length * ENCODED_DIM);
	for (let i = 0; i < length; i++) {
		mat.set(encodeGenome(population[i]).data, i * ENCODED_DIM);
	}
	return mat;
}
