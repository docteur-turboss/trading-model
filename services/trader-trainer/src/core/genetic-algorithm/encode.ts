import { MAX_DEPTH, ACTIVATIONS, CONNECTION_TYPES, GenomeEncoding, encodedDim } from "./encoding-vector";
import type { Genome } from "./genome-types";

function _encodeRLScalars(enc: GenomeEncoding, rl: Genome["rl"]): void {
	enc.gamma = rl.gamma;
	enc.learningRate = Math.log10(Math.max(1e-6, rl.learningRate)) / 6 + 1;
	enc.clipMin = rl.rewardShaping.clipMin;
	enc.clipMax = rl.rewardShaping.clipMax;
	enc.scaleFactor = Math.log10(Math.max(0.001, rl.rewardShaping.scaleFactor)) / 3 + 1;
	enc.maxEpisodeLength = rl.horizon.maxEpisodeLength / 2_000;
	enc.nStepReturn = rl.horizon.nStepReturn / 20;
	enc.frameSkip = rl.horizon.frameSkip / 10;
	enc.epsilonStart = rl.discretePolicy.epsilonStart;
	enc.epsilonMin = rl.discretePolicy.epsilonMin / 0.2;
	enc.epsilonDecay = rl.discretePolicy.epsilonDecay;
	enc.temperature = Math.log10(Math.max(0.01, rl.discretePolicy.temperature)) / 2 + 0.5;
	enc.noiseStd = rl.continuousPolicy.noiseStd / 5;
	enc.noiseDecay = rl.continuousPolicy.noiseDecay;
	enc.bufferSize = Math.log10(Math.max(100, rl.replayBuffer.bufferSize)) / 6;
	enc.alphaPER = rl.replayBuffer.alphaPER;
	enc.betaPER = rl.replayBuffer.betaPER;
}

function _encodeMutationScalars(enc: GenomeEncoding, mutation: Genome["mutation"]): void {
	enc.mutationRate = mutation.rate / 0.5;
	enc.mutationSigma = Math.log10(Math.max(1e-5, mutation.sigma)) / 4 + 1.25;
	enc.mutationSelfSigma = Math.log10(Math.max(1e-5, mutation.selfSigma)) / 4 + 1.25;
}

function _encodeNetworkScalars(enc: GenomeEncoding, net: Genome["network"]): void {
	enc.networkInputDim = net.inputDim / 256;
	enc.networkOutputDim = net.outputDim / 64;
	enc.networkDepth = net.hiddenLayers.length / MAX_DEPTH;
}

function _encodeLayers(enc: GenomeEncoding, net: Genome["network"]): void {
	const layers = net.hiddenLayers.slice(0, MAX_DEPTH);
	for (const layer of layers) {
		const actIdx = ACTIVATIONS.indexOf(layer.activation);
		const ctIdx = CONNECTION_TYPES.indexOf(layer.connectionType);
		enc.layers.push({
			neurons: layer.neurons / 512,
			activationIdx: actIdx >= 0 ? actIdx : 0,
			connectionTypeIdx: ctIdx >= 0 ? ctIdx : 0,
		});
	}
}

export function encodeGenome(genome: Genome): GenomeEncoding {
	const enc = new GenomeEncoding();
	_encodeRLScalars(enc, genome.rl);
	_encodeMutationScalars(enc, genome.mutation);
	_encodeNetworkScalars(enc, genome.network);
	_encodeLayers(enc, genome.network);
	return enc;
}

export function encodePopulation(population: Genome[]): Float32Array {
	const encodings = population.map(encodeGenome);
	const dim = encodings.length > 0 ? encodings[0].length : 0;
	const mat = new Float32Array(population.length * dim);
	for (let i = 0; i < population.length; i++) {
		mat.set(encodings[i].toFloat32Array(), i * dim);
	}
	return mat;
}
