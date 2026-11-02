import type { GenomeFitnessMeta, LamarckGenome } from "../genome-types";
import type { DeepReadonly } from "../shared-types";
import type { ObjectiveVector } from "./domination";
import { dominates } from "./domination";

/** Scalar fitness (run's fitness type) of an archived genome, when known. */
export interface ArchiveScore {
	fitness: number;
	meta?: GenomeFitnessMeta;
}

export interface ArchiveBest extends ArchiveScore {
	genome: DeepReadonly<LamarckGenome>;
}

const UNSCORED: ArchiveScore = { fitness: Number.NEGATIVE_INFINITY };

export class ParetoArchive {
	private _members: DeepReadonly<LamarckGenome>[] = [];
	private _objs: ObjectiveVector[] = [];
	private _scores: ArchiveScore[] = [];

	update(
		genomes: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		scores: ArchiveScore[] = []
	): boolean {
		let changed = false;

		for (let ci = 0; ci < genomes.length; ci++) {
			const cObj = objectives[ci];
			if (this._objs.some((aObj) => dominates(aObj, cObj))) {
				continue;
			}

			const keep = this._members.map(
				(_, ai) => !dominates(cObj, this._objs[ai])
			);
			this._members = [
				...this._members.filter((_unused, index) => keep[index]),
				genomes[ci],
			];
			this._objs = [
				...this._objs.filter((_unused, index) => keep[index]),
				cObj,
			];
			this._scores = [
				...this._scores.filter((_unused, index) => keep[index]),
				scores[ci] ?? UNSCORED,
			];
			changed = true;
		}

		return changed;
	}

	/**
	 * The front member with the highest fitness: the front keeps the trade-offs
	 * between objectives, the run's fitness type picks the one to publish.
	 */
	best(): ArchiveBest | undefined {
		let bestIdx = -1;
		for (let idx = 0; idx < this._members.length; idx++) {
			if (
				bestIdx < 0 ||
				this._scores[idx].fitness > this._scores[bestIdx].fitness
			) {
				bestIdx = idx;
			}
		}
		return bestIdx < 0
			? undefined
			: { genome: this._members[bestIdx], ...this._scores[bestIdx] };
	}

	get members(): DeepReadonly<LamarckGenome>[] {
		return this._members;
	}
	get size(): number {
		return this._members.length;
	}
}
