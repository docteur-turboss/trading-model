import type { Genome } from "./genome-types";
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

function _encodeRLScalars(vec: Float32Array, rl: Genome["rl"]): void {
	vec[EncodingIndex.Gamma] = rl.gamma;
	vec[EncodingIndex.LearningRate] = Math.log10(Math.max(1e-6, rl.learningRate)) / 6 + 1;
	vec[EncodingIndex.ClipMin] = rl.rewardShaping.clipMin;
	vec[EncodingIndex.ClipMax] = rl.rewardShaping.clipMax;
	vec[EncodingIndex.ScaleFactor] = Math.log10(Math.max(0.001, rl.rewardShaping.scaleFactor)) / 3 + 1;
	vec[EncodingIndex.MaxEpisodeLength] = rl.horizon.maxEpisodeLength / 2_000;
	vec[EncodingIndex.NStepReturn] = rl.horizon.nStepReturn / 20;
	vec[EncodingIndex.FrameSkip] = rl.horizon.frameSkip / 10;
	vec[EncodingIndex.EpsilonStart] = rl.discretePolicy.epsilonStart;
	vec[EncodingIndex.EpsilonMin] = rl.discretePolicy.epsilonMin / 0.2;
	vec[EncodingIndex.EpsilonDecay] = rl.discretePolicy.epsilonDecay;
	vec[EncodingIndex.Temperature] = Math.log10(Math.max(0.01, rl.discretePolicy.temperature)) / 2 + 0.5;
	vec[EncodingIndex.NoiseStd] = rl.continuousPolicy.noiseStd / 5;
	vec[EncodingIndex.NoiseDecay] = rl.continuousPolicy.noiseDecay;
	vec[EncodingIndex.BufferSize] = Math.log10(Math.max(100, rl.replayBuffer.bufferSize)) / 6;
	vec[EncodingIndex.AlphaPER] = rl.replayBuffer.alphaPER;
	vec[EncodingIndex.BetaPER] = rl.replayBuffer.betaPER;
}

function _encodeMutationScalars(vec: Float32Array, mutation: Genome["mutation"]): void {
	vec[EncodingIndex.MutationRate] = mutation.rate / 0.5;
	vec[EncodingIndex.MutationSigma] = Math.log10(Math.max(1e-5, mutation.sigma)) / 4 + 1.25;
	vec[EncodingIndex.MutationSelfSigma] = Math.log10(Math.max(1e-5, mutation.selfSigma)) / 4 + 1.25;
}

function _encodeNetworkScalars(vec: Float32Array, net: Genome["network"]): void {
	vec[EncodingIndex.NetworkInputDim] = net.inputDim / 256;
	vec[EncodingIndex.NetworkOutputDim] = net.outputDim / 64;
	vec[EncodingIndex.NetworkDepth] = net.hiddenLayers.length / MAX_DEPTH;
}

function _encodeScalars(vec: Float32Array, genome: Genome): void {
	_encodeRLScalars(vec, genome.rl);
	_encodeMutationScalars(vec, genome.mutation);
	_encodeNetworkScalars(vec, genome.network);
}

function _encodeSingleLayer(vec: Float32Array, base: number, layer: Genome["network"]["hiddenLayers"][number]): void {
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

function _encodeLayers(vec: Float32Array, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);

	for (let i = 0; i < MAX_DEPTH; i++) {
		if (i >= layers.length) {
			continue;
		}
		_encodeSingleLayer(vec, SCALAR_DIM + i * LAYER_DIM, layers[i]);
	}
}

export function encodeGenome(genome: Genome): Float32Array {
	const vec = new Float32Array(ENCODED_DIM);
	_encodeScalars(vec, genome);
	_encodeLayers(vec, genome.network);
	return vec;
}

export function encodePopulation(population: Genome[]): Float32Array {
	const length = population.length;
	const mat = new Float32Array(length * ENCODED_DIM);
	for (let i = 0; i < length; i++) {
		mat.set(encodeGenome(population[i]), i * ENCODED_DIM);
	}
	return mat;
}
