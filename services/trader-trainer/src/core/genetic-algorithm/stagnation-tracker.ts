import type {
	GenomeFitnessMeta,
	LamarckGenome,
	PopMember,
} from "./genome-types";
import type { DeepReadonly } from "./shared-types";

export interface TrackResult {
	genome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
}

export class StagnationTracker {
	private _bestFitness = Number.NEGATIVE_INFINITY;
	private _stagnation = 0;
	private _efficiencyHistory: number[] = [];

	reset(): void {
		this._bestFitness = Number.NEGATIVE_INFINITY;
		this._stagnation = 0;
		this._efficiencyHistory = [];
	}

	private _findBestMember(popWithMeta: PopMember[]): PopMember {
		return popWithMeta.reduce((best, m) =>
			m.fitness > best.fitness ? m : best
		);
	}

	private _handleImprovement(
		bestScalar: number,
		popWithMeta: PopMember[],
		avgEff: number
	): TrackResult {
		this._bestFitness = bestScalar;
		const bestMember = this._findBestMember(popWithMeta);
		this._stagnation = 0;
		this._efficiencyHistory.push(avgEff);
		return { genome: bestMember.genome, meta: bestMember.fitnessMeta };
	}

	private _handleStagnation(avgEff: number): void {
		this._stagnation++;
		this._efficiencyHistory.push(avgEff);
	}

	track(
		popWithMeta: PopMember[],
		_metas: GenomeFitnessMeta[],
		avgEff: number
	): TrackResult | undefined {
		const bestScalar = Math.max(...popWithMeta.map((m) => m.fitness));
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
