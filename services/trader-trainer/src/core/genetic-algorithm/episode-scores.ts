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

	sharpe(): number {
		if (this._scores.length < 2) {
			return 0;
		}
		const mean = this.mean();
		const std = Math.sqrt(this.variance());
		return std < 1e-10 ? mean : mean / std;
	}

	sortino(): number {
		if (this._scores.length < 2) {
			return 0;
		}
		const mean = this.mean();
		const negReturns = this._scores.filter((value) => value < 0);
		const downDev =
			negReturns.length === 0
				? 1e-10
				: Math.sqrt(
						negReturns
							.map((value) => value ** 2)
							.reduce((sum, value) => sum + value, 0) / negReturns.length
					);
		return mean / downDev;
	}

	calmar(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		const mean = this.mean();
		let maxDD = 0;
		let peak = Number.NEGATIVE_INFINITY;
		let running = 0;
		for (const result of this._scores) {
			running += result;
			if (running > peak) {
				peak = running;
			}
			const dd = peak - running;
			if (dd > maxDD) {
				maxDD = dd;
			}
		}
		return maxDD < 1e-10 ? mean : mean / maxDD;
	}

	composite(): number {
		return 0.4 * this.mean() + 0.3 * this.sharpe() + 0.3 * this.sortino();
	}
}
