/**
 * Relative floor of every ratio denominator: a degenerate series (constant,
 * no loss, no drawdown) scores at most 1/0.1 = 10 times its mean (when
 * |mean| >= 1), the order of a good realistic ratio (0.5 to 3), and no jump.
 */
const DENOMINATOR_FLOOR = 0.1;

function ratio(mean: number, denominator: number): number {
	return (
		mean /
		Math.max(denominator, DENOMINATOR_FLOOR * Math.max(1, Math.abs(mean)))
	);
}

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
		return ratio(mean, std);
	}

	/**
	 * Mean over downside deviation, the deviation taken over every score (a
	 * gain counts 0). The denominator is floored like {@link sharpe}'s, so a
	 * series without loss gives a large but bounded ratio.
	 */
	sortino(): number {
		if (this._scores.length < 2) {
			return 0;
		}
		const mean = this.mean();
		const downDev = Math.sqrt(
			this._scores.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) /
				this._scores.length
		);
		return ratio(mean, downDev);
	}

	/**
	 * Largest fall of the cumulative score from its previous peak, in score
	 * units (episode PnL), counted from the first episode. 0 without a fall.
	 */
	maxDrawdown(): number {
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
		return maxDD;
	}

	calmar(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		const mean = this.mean();
		const maxDD = this.maxDrawdown();
		return ratio(mean, maxDD);
	}

	/** Weighted tanh of mean, Sharpe and Sortino: dimensionless terms in (-1, 1). */
	composite(): number {
		return (
			0.4 * Math.tanh(this.mean()) +
			0.3 * Math.tanh(this.sharpe()) +
			0.3 * Math.tanh(this.sortino())
		);
	}
}
