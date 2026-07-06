export const SCALAR_DIM = 23;

export class EncodingVector {
	static readonly SCALAR_DIM = 23;
	readonly data: Float32Array;

	constructor(dim?: number) {
		this.data = new Float32Array(dim ?? SCALAR_DIM);
	}

	get length(): number {
		return this.data.length;
	}

	get gamma(): number { return this.data[0]; }
	set gamma(v: number) { this.data[0] = v; }

	get learningRate(): number { return this.data[1]; }
	set learningRate(v: number) { this.data[1] = v; }

	get clipMin(): number { return this.data[2]; }
	set clipMin(v: number) { this.data[2] = v; }

	get clipMax(): number { return this.data[3]; }
	set clipMax(v: number) { this.data[3] = v; }

	get scaleFactor(): number { return this.data[4]; }
	set scaleFactor(v: number) { this.data[4] = v; }

	get maxEpisodeLength(): number { return this.data[5]; }
	set maxEpisodeLength(v: number) { this.data[5] = v; }

	get nStepReturn(): number { return this.data[6]; }
	set nStepReturn(v: number) { this.data[6] = v; }

	get frameSkip(): number { return this.data[7]; }
	set frameSkip(v: number) { this.data[7] = v; }

	get epsilonStart(): number { return this.data[8]; }
	set epsilonStart(v: number) { this.data[8] = v; }

	get epsilonMin(): number { return this.data[9]; }
	set epsilonMin(v: number) { this.data[9] = v; }

	get epsilonDecay(): number { return this.data[10]; }
	set epsilonDecay(v: number) { this.data[10] = v; }

	get temperature(): number { return this.data[11]; }
	set temperature(v: number) { this.data[11] = v; }

	get noiseStd(): number { return this.data[12]; }
	set noiseStd(v: number) { this.data[12] = v; }

	get noiseDecay(): number { return this.data[13]; }
	set noiseDecay(v: number) { this.data[13] = v; }

	get bufferSize(): number { return this.data[14]; }
	set bufferSize(v: number) { this.data[14] = v; }

	get alphaPER(): number { return this.data[15]; }
	set alphaPER(v: number) { this.data[15] = v; }

	get betaPER(): number { return this.data[16]; }
	set betaPER(v: number) { this.data[16] = v; }

	get mutationRate(): number { return this.data[17]; }
	set mutationRate(v: number) { this.data[17] = v; }

	get mutationSigma(): number { return this.data[18]; }
	set mutationSigma(v: number) { this.data[18] = v; }

	get mutationSelfSigma(): number { return this.data[19]; }
	set mutationSelfSigma(v: number) { this.data[19] = v; }

	get networkInputDim(): number { return this.data[20]; }
	set networkInputDim(v: number) { this.data[20] = v; }

	get networkOutputDim(): number { return this.data[21]; }
	set networkOutputDim(v: number) { this.data[21] = v; }

	get networkDepth(): number { return this.data[22]; }
	set networkDepth(v: number) { this.data[22] = v; }
}
