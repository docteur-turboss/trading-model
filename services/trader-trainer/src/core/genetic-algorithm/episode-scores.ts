export class EpisodeScores {
	private readonly _scores: readonly number[];

	constructor(scores: number[]) {
		this._scores = Object.freeze([...scores]);
	}

	get values(): readonly number[] {
		return this._scores;
	}

	get length(): number {
		return this._scores.length;
	}

	mean(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		return this._scores.reduce((sum, sc) => sum + sc, 0) / this._scores.length;
	}

	total(): number {
		return this._scores.reduce((sum, sc) => sum + sc, 0);
	}

	variance(): number {
		if (this._scores.length < 2) {
			return 0;
		}
		const avg = this.mean();
		return (
			this._scores.reduce((sum, sc) => sum + (sc - avg) ** 2, 0) /
			(this._scores.length - 1)
		);
	}

	best(): number {
		if (this._scores.length === 0) {
			return Number.NEGATIVE_INFINITY;
		}
		return Math.max(...this._scores);
	}

	worst(): number {
		if (this._scores.length === 0) {
			return Number.POSITIVE_INFINITY;
		}
		return Math.min(...this._scores);
	}
}
