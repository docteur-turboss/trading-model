import {
	ACTIVATIONS,
	CONNECTION_TYPES,
	encodedDim,
	layerOffset,
	MAX_DEPTH,
	writeEncodedLayer,
	writeScalar,
} from "./encoding-indices";
import type { Genome } from "./genome-types";

function _writeRLScalars(arr: Float32Array, rl: Genome["rl"]): void {
	writeScalar(arr, "Gamma", rl.gamma);
	writeScalar(arr, "LearningRate", (Math.log10(rl.learningRate) / 6 + 1) / 2);
	writeScalar(arr, "ClipMin", rl.rewardShaping.clipBounds.min);
	writeScalar(arr, "ClipMax", rl.rewardShaping.clipBounds.max);
	writeScalar(
		arr,
		"ScaleFactor",
		(Math.log10(rl.rewardShaping.scaleFactor) / 3 + 1) / 2
	);
	writeScalar(arr, "MaxEpisodeLength", rl.horizon.maxEpisodeLength / 2_000);
	writeScalar(arr, "NStepReturn", rl.horizon.nStepReturn / 20);
	writeScalar(arr, "FrameSkip", rl.horizon.frameSkip / 10);
	writeScalar(arr, "EpsilonStart", rl.discretePolicy.epsilonStart);
	writeScalar(arr, "EpsilonMin", rl.discretePolicy.epsilonMin / 0.2);
	writeScalar(arr, "EpsilonDecay", rl.discretePolicy.epsilonDecay);
	writeScalar(
		arr,
		"Temperature",
		Math.log10(rl.discretePolicy.temperature) / 2 + 0.5
	);
	writeScalar(arr, "NoiseStd", rl.continuousPolicy.noiseStd / 5);
	writeScalar(arr, "NoiseDecay", rl.continuousPolicy.noiseDecay);
	writeScalar(arr, "BufferSize", Math.log10(rl.replayBuffer.bufferSize) / 6);
	writeScalar(arr, "AlphaPER", rl.replayBuffer.alphaPER);
	writeScalar(arr, "BetaPER", rl.replayBuffer.betaPER);
}

function _writeMutationScalars(
	arr: Float32Array,
	mutation: Genome["mutation"]
): void {
	writeScalar(arr, "MutationRate", mutation.rate / 0.5);
	writeScalar(
		arr,
		"MutationSigma",
		Math.log10(Math.max(1e-5, mutation.sigma)) / 4 + 1.25
	);
	writeScalar(
		arr,
		"MutationSelfSigma",
		Math.log10(Math.max(1e-5, mutation.selfSigma)) / 4 + 1.25
	);
}

function _writeNetworkScalars(arr: Float32Array, net: Genome["network"]): void {
	writeScalar(arr, "NetworkInputDim", net.inputDim / 256);
	writeScalar(arr, "NetworkOutputDim", net.outputDim / 64);
	writeScalar(arr, "NetworkDepth", net.hiddenLayers.length / MAX_DEPTH);
}

function _writeLayers(arr: Float32Array, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);
	for (let i = 0; i < layers.length; i++) {
		const layer = layers[i];
		const actIdx = ACTIVATIONS.indexOf(layer.activation);
		const ctIdx = CONNECTION_TYPES.indexOf(layer.connectionType);
		writeEncodedLayer(arr, layerOffset(i), {
			neurons: layer.neurons / 512,
			activationIdx: actIdx >= 0 ? actIdx : 0,
			connectionTypeIdx: ctIdx >= 0 ? ctIdx : 0,
		});
	}
}

export function encodeGenome(genome: Genome): Float32Array {
	const layerCount = Math.min(genome.network.hiddenLayers.length, MAX_DEPTH);
	const totalDim = encodedDim(layerCount);
	const arr = new Float32Array(totalDim);
	_writeRLScalars(arr, genome.rl);
	_writeMutationScalars(arr, genome.mutation);
	_writeNetworkScalars(arr, genome.network);
	_writeLayers(arr, genome.network);
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
