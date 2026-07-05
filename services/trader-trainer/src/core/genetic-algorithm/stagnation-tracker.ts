import type { GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";

export class StagnationTracker {
	private _bestGenome: DeepReadonly<LamarckGenome> | null = null;
	private _bestFitness = Number.NEGATIVE_INFINITY;
	private _stagnation = 0;
	private _efficiencyHistory: number[] = [];

	reset(): void {
		this._bestFitness = Number.NEGATIVE_INFINITY;
		this._stagnation = 0;
		this._efficiencyHistory = [];
		this._bestGenome = null;
	}

	track(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		_metas: GenomeFitnessMeta[],
		avgEff: number
	): void {
		const bestScalar = Math.max(
			...popWithMeta.map((genome) => genome.fitness ?? Number.NEGATIVE_INFINITY)
		);
		if (bestScalar > this._bestFitness + 1e-6) {
			this._bestFitness = bestScalar;
			this._bestGenome = popWithMeta.reduce((best, genome) =>
				(genome.fitness ?? Number.NEGATIVE_INFINITY) >
				(best.fitness ?? Number.NEGATIVE_INFINITY)
					? genome
					: best
			);
			this._stagnation = 0;
		} else {
			this._stagnation++;
		}

		this._efficiencyHistory.push(avgEff);
	}

	get bestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._bestGenome;
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
