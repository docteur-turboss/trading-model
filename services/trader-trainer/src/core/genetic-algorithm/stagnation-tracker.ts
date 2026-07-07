import type { GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";

export class StagnationTracker {
	private _bestFitness = Number.NEGATIVE_INFINITY;
	private _stagnation = 0;
	private _efficiencyHistory: number[] = [];

	reset(): void {
		this._bestFitness = Number.NEGATIVE_INFINITY;
		this._stagnation = 0;
		this._efficiencyHistory = [];
	}

	private _findBestFitness(popWithMeta: DeepReadonly<LamarckGenome>[]): number {
		return Math.max(
			...popWithMeta.map((genome) => genome.fitness ?? Number.NEGATIVE_INFINITY)
		);
	}

	private _findBestGenome(
		popWithMeta: DeepReadonly<LamarckGenome>[]
	): DeepReadonly<LamarckGenome> {
		return popWithMeta.reduce((best, genome) =>
			(genome.fitness ?? Number.NEGATIVE_INFINITY) >
			(best.fitness ?? Number.NEGATIVE_INFINITY)
				? genome
				: best
		);
	}

	private _handleImprovement(
		bestScalar: number,
		popWithMeta: DeepReadonly<LamarckGenome>[],
		avgEff: number
	): DeepReadonly<LamarckGenome> {
		this._bestFitness = bestScalar;
		const bestGenome = this._findBestGenome(popWithMeta);
		this._stagnation = 0;
		this._efficiencyHistory.push(avgEff);
		return bestGenome;
	}

	private _handleStagnation(avgEff: number): void {
		this._stagnation++;
		this._efficiencyHistory.push(avgEff);
	}

	track(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		_metas: GenomeFitnessMeta[],
		avgEff: number
	): DeepReadonly<LamarckGenome> | undefined {
		const bestScalar = this._findBestFitness(popWithMeta);
		if (bestScalar > this._bestFitness + 1e-6) {
			return this._handleImprovement(bestScalar, popWithMeta, avgEff);
		}
		this._handleStagnation(avgEff);
	}

	get bestFitness(): number {
		return this._bestFitness;
	}

	get stagnation(): number {
		return this._stagnation;
	}

	get efficiencyHistory(): number[] {
		return this._efficiencyHistory;
	}
}
