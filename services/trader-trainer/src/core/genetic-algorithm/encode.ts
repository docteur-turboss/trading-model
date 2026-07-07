import { EncodingIndex, MAX_DEPTH, ACTIVATIONS, CONNECTION_TYPES, encodedDim, layerOffset, writeEncodedLayer } from "./encoding-indices";
import type { Genome } from "./genome-types";

function _writeRLScalars(arr: Float32Array, rl: Genome["rl"]): void {
	arr[EncodingIndex.Gamma] = rl.gamma;
	arr[EncodingIndex.LearningRate] = Math.log10(Math.max(1e-6, rl.learningRate)) / 6 + 1;
	arr[EncodingIndex.ClipMin] = rl.rewardShaping.clipBounds.min;
	arr[EncodingIndex.ClipMax] = rl.rewardShaping.clipBounds.max;
	arr[EncodingIndex.ScaleFactor] = Math.log10(Math.max(0.001, rl.rewardShaping.scaleFactor)) / 3 + 1;
	arr[EncodingIndex.MaxEpisodeLength] = rl.horizon.maxEpisodeLength / 2_000;
	arr[EncodingIndex.NStepReturn] = rl.horizon.nStepReturn / 20;
	arr[EncodingIndex.FrameSkip] = rl.horizon.frameSkip / 10;
	arr[EncodingIndex.EpsilonStart] = rl.discretePolicy.epsilonStart;
	arr[EncodingIndex.EpsilonMin] = rl.discretePolicy.epsilonMin / 0.2;
	arr[EncodingIndex.EpsilonDecay] = rl.discretePolicy.epsilonDecay;
	arr[EncodingIndex.Temperature] = Math.log10(Math.max(0.01, rl.discretePolicy.temperature)) / 2 + 0.5;
	arr[EncodingIndex.NoiseStd] = rl.continuousPolicy.noiseStd / 5;
	arr[EncodingIndex.NoiseDecay] = rl.continuousPolicy.noiseDecay;
	arr[EncodingIndex.BufferSize] = Math.log10(Math.max(100, rl.replayBuffer.bufferSize)) / 6;
	arr[EncodingIndex.AlphaPER] = rl.replayBuffer.alphaPER;
	arr[EncodingIndex.BetaPER] = rl.replayBuffer.betaPER;
}

function _writeMutationScalars(arr: Float32Array, mutation: Genome["mutation"]): void {
	arr[EncodingIndex.MutationRate] = mutation.rate / 0.5;
	arr[EncodingIndex.MutationSigma] = Math.log10(Math.max(1e-5, mutation.sigma)) / 4 + 1.25;
	arr[EncodingIndex.MutationSelfSigma] = Math.log10(Math.max(1e-5, mutation.selfSigma)) / 4 + 1.25;
}

function _writeNetworkScalars(arr: Float32Array, net: Genome["network"]): void {
	arr[EncodingIndex.NetworkInputDim] = net.inputDim / 256;
	arr[EncodingIndex.NetworkOutputDim] = net.outputDim / 64;
	arr[EncodingIndex.NetworkDepth] = net.hiddenLayers.length / MAX_DEPTH;
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
	const dim = encodedDim(Math.min(population[0].network.hiddenLayers.length, MAX_DEPTH));
	const mat = new Float32Array(population.length * dim);
	for (let i = 0; i < population.length; i++) {
		mat.set(encodeGenome(population[i]), i * dim);
	}
	return mat;
}
