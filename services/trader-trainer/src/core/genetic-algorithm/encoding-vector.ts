import { EncodingIndex, SCALAR_DIM } from "./encoding-indices";

export { SCALAR_DIM };

export class EncodingVector {
	static readonly SCALAR_DIM = SCALAR_DIM;
	readonly data: Float32Array;

	constructor(dim?: number) {
		this.data = new Float32Array(dim ?? SCALAR_DIM);
	}

	get length(): number {
		return this.data.length;
	}

	get gamma(): number { return this.data[EncodingIndex.Gamma]; }
	set gamma(v: number) { this.data[EncodingIndex.Gamma] = v; }

	get learningRate(): number { return this.data[EncodingIndex.LearningRate]; }
	set learningRate(v: number) { this.data[EncodingIndex.LearningRate] = v; }

	get clipMin(): number { return this.data[EncodingIndex.ClipMin]; }
	set clipMin(v: number) { this.data[EncodingIndex.ClipMin] = v; }

	get clipMax(): number { return this.data[EncodingIndex.ClipMax]; }
	set clipMax(v: number) { this.data[EncodingIndex.ClipMax] = v; }

	get scaleFactor(): number { return this.data[EncodingIndex.ScaleFactor]; }
	set scaleFactor(v: number) { this.data[EncodingIndex.ScaleFactor] = v; }

	get maxEpisodeLength(): number { return this.data[EncodingIndex.MaxEpisodeLength]; }
	set maxEpisodeLength(v: number) { this.data[EncodingIndex.MaxEpisodeLength] = v; }

	get nStepReturn(): number { return this.data[EncodingIndex.NStepReturn]; }
	set nStepReturn(v: number) { this.data[EncodingIndex.NStepReturn] = v; }

	get frameSkip(): number { return this.data[EncodingIndex.FrameSkip]; }
	set frameSkip(v: number) { this.data[EncodingIndex.FrameSkip] = v; }

	get epsilonStart(): number { return this.data[EncodingIndex.EpsilonStart]; }
	set epsilonStart(v: number) { this.data[EncodingIndex.EpsilonStart] = v; }

	get epsilonMin(): number { return this.data[EncodingIndex.EpsilonMin]; }
	set epsilonMin(v: number) { this.data[EncodingIndex.EpsilonMin] = v; }

	get epsilonDecay(): number { return this.data[EncodingIndex.EpsilonDecay]; }
	set epsilonDecay(v: number) { this.data[EncodingIndex.EpsilonDecay] = v; }

	get temperature(): number { return this.data[EncodingIndex.Temperature]; }
	set temperature(v: number) { this.data[EncodingIndex.Temperature] = v; }

	get noiseStd(): number { return this.data[EncodingIndex.NoiseStd]; }
	set noiseStd(v: number) { this.data[EncodingIndex.NoiseStd] = v; }

	get noiseDecay(): number { return this.data[EncodingIndex.NoiseDecay]; }
	set noiseDecay(v: number) { this.data[EncodingIndex.NoiseDecay] = v; }

	get bufferSize(): number { return this.data[EncodingIndex.BufferSize]; }
	set bufferSize(v: number) { this.data[EncodingIndex.BufferSize] = v; }

	get alphaPER(): number { return this.data[EncodingIndex.AlphaPER]; }
	set alphaPER(v: number) { this.data[EncodingIndex.AlphaPER] = v; }

	get betaPER(): number { return this.data[EncodingIndex.BetaPER]; }
	set betaPER(v: number) { this.data[EncodingIndex.BetaPER] = v; }

	get mutationRate(): number { return this.data[EncodingIndex.MutationRate]; }
	set mutationRate(v: number) { this.data[EncodingIndex.MutationRate] = v; }

	get mutationSigma(): number { return this.data[EncodingIndex.MutationSigma]; }
	set mutationSigma(v: number) { this.data[EncodingIndex.MutationSigma] = v; }

	get mutationSelfSigma(): number { return this.data[EncodingIndex.MutationSelfSigma]; }
	set mutationSelfSigma(v: number) { this.data[EncodingIndex.MutationSelfSigma] = v; }

	get networkInputDim(): number { return this.data[EncodingIndex.NetworkInputDim]; }
	set networkInputDim(v: number) { this.data[EncodingIndex.NetworkInputDim] = v; }

	get networkOutputDim(): number { return this.data[EncodingIndex.NetworkOutputDim]; }
	set networkOutputDim(v: number) { this.data[EncodingIndex.NetworkOutputDim] = v; }

	get networkDepth(): number { return this.data[EncodingIndex.NetworkDepth]; }
	set networkDepth(v: number) { this.data[EncodingIndex.NetworkDepth] = v; }
}
