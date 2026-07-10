export class EpisodeScores {
	private readonly _scores: ReadonlyArray<number>;

	constructor(scores: number[]) {
		this._scores = Object.freeze([...scores]);
	}

	get values(): ReadonlyArray<number> {
		return this._scores;
	}

	get length(): number {
		return this._scores.length;
	}

	mean(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		return this._scores.reduce((sum, s) => sum + s, 0) / this._scores.length;
	}

	total(): number {
		return this._scores.reduce((sum, s) => sum + s, 0);
	}

	variance(): number {
		if (this._scores.length < 2) {
			return 0;
		}
		const m = this.mean();
		return this._scores.reduce((sum, s) => sum + (s - m) ** 2, 0) / (this._scores.length - 1);
	}

	best(): number {
		if (this._scores.length === 0) {
			return -Infinity;
		}
		return Math.max(...this._scores);
	}

	worst(): number {
		if (this._scores.length === 0) {
			return Infinity;
		}
		return Math.min(...this._scores);
	}
}
