export class ScoreTracker {
	private _scores: number[] = [];

	public addScore(score: number): void {
		this._scores.push(score);
	}

	public getAverageScore(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		let sum = 0;
		for (let i = 0; i < this._scores.length; i++) {
			sum += this._scores[i];
		}
		return sum / this._scores.length;
	}

	public getTotalScore(): number {
		let sum = 0;
		for (let i = 0; i < this._scores.length; i++) {
			sum += this._scores[i];
		}
		return sum;
	}

	public resetScores(): void {
		this._scores = [];
	}
}
