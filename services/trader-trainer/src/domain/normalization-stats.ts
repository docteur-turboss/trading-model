/** Online running mean and standard deviation for z-score normalisation. */
export class NormalizationStats {
	private _count = 0;
	private _mean = 0;
	private _m2 = 0;

	/** Incorporate a new observation and update running statistics. */
	update(value: number): void {
		this._count++;
		const delta = value - this._mean;
		this._mean += delta / this._count;
		const delta2 = value - this._mean;
		this._m2 += delta * delta2;
	}

	getMean(): number {
		return this._mean;
	}

	get mu(): number {
		return this._mean;
	}

	getStd(): number {
		if (this._count < 2) {
			return 0;
		}
		return Math.sqrt(this._m2 / (this._count - 1));
	}

	get std(): number {
		return this.getStd();
	}

	/** Normalise `value` to z-score using current running statistics. */
	normalize(value: number): number {
		const std = this.getStd();
		if (std < 1e-10) {
			return 0;
		}
		return (value - this._mean) / std;
	}

	/** Serialize internal state for checkpointing. */
	toJSON(): { count: number; mean: number; m2: number } {
		return { count: this._count, mean: this._mean, m2: this._m2 };
	}

	/** Deserialize and create a NormalizationStats from a saved snapshot. */
	static fromJSON(data: {
		count: number;
		mean: number;
		m2: number;
	}): NormalizationStats {
		const ns = new NormalizationStats();
		ns._count = data.count;
		ns._mean = data.mean;
		ns._m2 = data.m2;
		return ns;
	}
}
