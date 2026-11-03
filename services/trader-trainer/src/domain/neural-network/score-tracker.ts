export class ScoreTracker {
	private _count = 0;
	private _sum = 0;

	public addScore(score: number): void {
		this._count++;
		this._sum += score;
	}

	public getAverageScore(): number {
		return this._count === 0 ? 0 : this._sum / this._count;
	}

	public getTotalScore(): number {
		return this._sum;
	}

	public resetScores(): void {
		this._count = 0;
		this._sum = 0;
	}
}
