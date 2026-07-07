import {
	ACTIVATIONS,
	CONNECTION_TYPES,
	EncodingIndex,
	MAX_DEPTH,
	SCALAR_DIM,
} from "./encoding-indices";

export { ACTIVATIONS, CONNECTION_TYPES, MAX_DEPTH, SCALAR_DIM, encodedDim } from "./encoding-indices";

export interface LayerEncoding {
	neurons: number;
	activationIdx: number;
	connectionTypeIdx: number;
}

export class EncodingVector {
	gamma = 0;
	learningRate = 0;
	clipMin = 0;
	clipMax = 0;
	scaleFactor = 0;
	maxEpisodeLength = 0;
	nStepReturn = 0;
	frameSkip = 0;
	epsilonStart = 0;
	epsilonMin = 0;
	epsilonDecay = 0;
	temperature = 0;
	noiseStd = 0;
	noiseDecay = 0;
	bufferSize = 0;
	alphaPER = 0;
	betaPER = 0;
	mutationRate = 0;
	mutationSigma = 0;
	mutationSelfSigma = 0;
	networkInputDim = 0;
	networkOutputDim = 0;
	networkDepth = 0;
	layers: LayerEncoding[] = [];

	get length(): number {
		return SCALAR_DIM + this.layers.length * 3;
	}

	toFloat32Array(): Float32Array {
		const totalDim = this.length;
		const arr = new Float32Array(totalDim);
		arr[EncodingIndex.Gamma] = this.gamma;
		arr[EncodingIndex.LearningRate] = this.learningRate;
		arr[EncodingIndex.ClipMin] = this.clipMin;
		arr[EncodingIndex.ClipMax] = this.clipMax;
		arr[EncodingIndex.ScaleFactor] = this.scaleFactor;
		arr[EncodingIndex.MaxEpisodeLength] = this.maxEpisodeLength;
		arr[EncodingIndex.NStepReturn] = this.nStepReturn;
		arr[EncodingIndex.FrameSkip] = this.frameSkip;
		arr[EncodingIndex.EpsilonStart] = this.epsilonStart;
		arr[EncodingIndex.EpsilonMin] = this.epsilonMin;
		arr[EncodingIndex.EpsilonDecay] = this.epsilonDecay;
		arr[EncodingIndex.Temperature] = this.temperature;
		arr[EncodingIndex.NoiseStd] = this.noiseStd;
		arr[EncodingIndex.NoiseDecay] = this.noiseDecay;
		arr[EncodingIndex.BufferSize] = this.bufferSize;
		arr[EncodingIndex.AlphaPER] = this.alphaPER;
		arr[EncodingIndex.BetaPER] = this.betaPER;
		arr[EncodingIndex.MutationRate] = this.mutationRate;
		arr[EncodingIndex.MutationSigma] = this.mutationSigma;
		arr[EncodingIndex.MutationSelfSigma] = this.mutationSelfSigma;
		arr[EncodingIndex.NetworkInputDim] = this.networkInputDim;
		arr[EncodingIndex.NetworkOutputDim] = this.networkOutputDim;
		arr[EncodingIndex.NetworkDepth] = this.networkDepth;

		let offset = SCALAR_DIM;
		for (const layer of this.layers) {
			arr[offset] = layer.neurons;
			arr[offset + 1] = layer.activationIdx;
			arr[offset + 2] = layer.connectionTypeIdx;
			offset += 3;
		}
		return arr;
	}

	static fromFloat32Array(arr: Float32Array): EncodingVector {
		const vec = new EncodingVector();
		vec.gamma = arr[EncodingIndex.Gamma] ?? 0;
		vec.learningRate = arr[EncodingIndex.LearningRate] ?? 0;
		vec.clipMin = arr[EncodingIndex.ClipMin] ?? 0;
		vec.clipMax = arr[EncodingIndex.ClipMax] ?? 0;
		vec.scaleFactor = arr[EncodingIndex.ScaleFactor] ?? 0;
		vec.maxEpisodeLength = arr[EncodingIndex.MaxEpisodeLength] ?? 0;
		vec.nStepReturn = arr[EncodingIndex.NStepReturn] ?? 0;
		vec.frameSkip = arr[EncodingIndex.FrameSkip] ?? 0;
		vec.epsilonStart = arr[EncodingIndex.EpsilonStart] ?? 0;
		vec.epsilonMin = arr[EncodingIndex.EpsilonMin] ?? 0;
		vec.epsilonDecay = arr[EncodingIndex.EpsilonDecay] ?? 0;
		vec.temperature = arr[EncodingIndex.Temperature] ?? 0;
		vec.noiseStd = arr[EncodingIndex.NoiseStd] ?? 0;
		vec.noiseDecay = arr[EncodingIndex.NoiseDecay] ?? 0;
		vec.bufferSize = arr[EncodingIndex.BufferSize] ?? 0;
		vec.alphaPER = arr[EncodingIndex.AlphaPER] ?? 0;
		vec.betaPER = arr[EncodingIndex.BetaPER] ?? 0;
		vec.mutationRate = arr[EncodingIndex.MutationRate] ?? 0;
		vec.mutationSigma = arr[EncodingIndex.MutationSigma] ?? 0;
		vec.mutationSelfSigma = arr[EncodingIndex.MutationSelfSigma] ?? 0;
		vec.networkInputDim = arr[EncodingIndex.NetworkInputDim] ?? 0;
		vec.networkOutputDim = arr[EncodingIndex.NetworkOutputDim] ?? 0;
		vec.networkDepth = arr[EncodingIndex.NetworkDepth] ?? 0;

		const layerCount = Math.round(vec.networkDepth * MAX_DEPTH);
		let offset = SCALAR_DIM;
		for (let i = 0; i < layerCount && offset + 2 < arr.length; i++) {
			vec.layers.push({
				neurons: arr[offset],
				activationIdx: arr[offset + 1],
				connectionTypeIdx: arr[offset + 2],
			});
			offset += 3;
		}
		return vec;
	}
}

export { EncodingVector as GenomeEncoding };
