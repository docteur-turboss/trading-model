import { EncodingIndex, SCALAR_DIM } from "./encoding-indices";

export { SCALAR_DIM };

export class EncodingVector {
	static readonly SCALAR_DIM = SCALAR_DIM;
	private readonly _data: Float32Array;

	constructor(dim?: number) {
		this._data = new Float32Array(dim ?? SCALAR_DIM);
	}

	static from(data: Float32Array): EncodingVector {
		const vec = new EncodingVector(data.length);
		vec._data.set(data);
		return vec;
	}

	get length(): number {
		return this._data.length;
	}

	toFloat32Array(): Float32Array {
		return this._data;
	}

	getAt(index: number): number {
		return this._data[index];
	}

	setAt(index: number, value: number): void {
		this._data[index] = value;
	}

	get gamma(): number {
		return this._data[EncodingIndex.Gamma];
	}
	set gamma(v: number) {
		this._data[EncodingIndex.Gamma] = v;
	}

	get learningRate(): number {
		return this._data[EncodingIndex.LearningRate];
	}
	set learningRate(v: number) {
		this._data[EncodingIndex.LearningRate] = v;
	}

	get clipMin(): number {
		return this._data[EncodingIndex.ClipMin];
	}
	set clipMin(v: number) {
		this._data[EncodingIndex.ClipMin] = v;
	}

	get clipMax(): number {
		return this._data[EncodingIndex.ClipMax];
	}
	set clipMax(v: number) {
		this._data[EncodingIndex.ClipMax] = v;
	}

	get scaleFactor(): number {
		return this._data[EncodingIndex.ScaleFactor];
	}
	set scaleFactor(v: number) {
		this._data[EncodingIndex.ScaleFactor] = v;
	}

	get maxEpisodeLength(): number {
		return this._data[EncodingIndex.MaxEpisodeLength];
	}
	set maxEpisodeLength(v: number) {
		this._data[EncodingIndex.MaxEpisodeLength] = v;
	}

	get nStepReturn(): number {
		return this._data[EncodingIndex.NStepReturn];
	}
	set nStepReturn(v: number) {
		this._data[EncodingIndex.NStepReturn] = v;
	}

	get frameSkip(): number {
		return this._data[EncodingIndex.FrameSkip];
	}
	set frameSkip(v: number) {
		this._data[EncodingIndex.FrameSkip] = v;
	}

	get epsilonStart(): number {
		return this._data[EncodingIndex.EpsilonStart];
	}
	set epsilonStart(v: number) {
		this._data[EncodingIndex.EpsilonStart] = v;
	}

	get epsilonMin(): number {
		return this._data[EncodingIndex.EpsilonMin];
	}
	set epsilonMin(v: number) {
		this._data[EncodingIndex.EpsilonMin] = v;
	}

	get epsilonDecay(): number {
		return this._data[EncodingIndex.EpsilonDecay];
	}
	set epsilonDecay(v: number) {
		this._data[EncodingIndex.EpsilonDecay] = v;
	}

	get temperature(): number {
		return this._data[EncodingIndex.Temperature];
	}
	set temperature(v: number) {
		this._data[EncodingIndex.Temperature] = v;
	}

	get noiseStd(): number {
		return this._data[EncodingIndex.NoiseStd];
	}
	set noiseStd(v: number) {
		this._data[EncodingIndex.NoiseStd] = v;
	}

	get noiseDecay(): number {
		return this._data[EncodingIndex.NoiseDecay];
	}
	set noiseDecay(v: number) {
		this._data[EncodingIndex.NoiseDecay] = v;
	}

	get bufferSize(): number {
		return this._data[EncodingIndex.BufferSize];
	}
	set bufferSize(v: number) {
		this._data[EncodingIndex.BufferSize] = v;
	}

	get alphaPER(): number {
		return this._data[EncodingIndex.AlphaPER];
	}
	set alphaPER(v: number) {
		this._data[EncodingIndex.AlphaPER] = v;
	}

	get betaPER(): number {
		return this._data[EncodingIndex.BetaPER];
	}
	set betaPER(v: number) {
		this._data[EncodingIndex.BetaPER] = v;
	}

	get mutationRate(): number {
		return this._data[EncodingIndex.MutationRate];
	}
	set mutationRate(v: number) {
		this._data[EncodingIndex.MutationRate] = v;
	}

	get mutationSigma(): number {
		return this._data[EncodingIndex.MutationSigma];
	}
	set mutationSigma(v: number) {
		this._data[EncodingIndex.MutationSigma] = v;
	}

	get mutationSelfSigma(): number {
		return this._data[EncodingIndex.MutationSelfSigma];
	}
	set mutationSelfSigma(v: number) {
		this._data[EncodingIndex.MutationSelfSigma] = v;
	}

	get networkInputDim(): number {
		return this._data[EncodingIndex.NetworkInputDim];
	}
	set networkInputDim(v: number) {
		this._data[EncodingIndex.NetworkInputDim] = v;
	}

	get networkOutputDim(): number {
		return this._data[EncodingIndex.NetworkOutputDim];
	}
	set networkOutputDim(v: number) {
		this._data[EncodingIndex.NetworkOutputDim] = v;
	}

	get networkDepth(): number {
		return this._data[EncodingIndex.NetworkDepth];
	}
	set networkDepth(v: number) {
		this._data[EncodingIndex.NetworkDepth] = v;
	}
}
