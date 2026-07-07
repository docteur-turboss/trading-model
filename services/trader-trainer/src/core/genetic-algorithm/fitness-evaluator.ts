import { evaluateFitness } from "./evaluation-pipeline";
import type { WindowSet } from "./generation-types";
import type { GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { ParetoArchive } from "./pareto-engine";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { StagnationTracker } from "./stagnation-tracker";

export class FitnessEvaluator {
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();

	constructor(
		private readonly _windowSets: WindowSet[],
		private readonly _backendFactory: BackendFactory,
		private readonly _evalConcurrency: number
	) {}

	get archive(): ParetoArchive {
		return this._archive;
	}

	get stagnationTracker(): StagnationTracker {
		return this._stagnationTracker;
	}

	async evaluate(population: DeepReadonly<LamarckGenome>[]): Promise<{
		updatedPop: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
	}> {
		return evaluateFitness({
			population,
			windowSets: this._windowSets,
			backendFactory: this._backendFactory,
			concurrency: this._evalConcurrency,
		});
	}

	updateArchive(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		popMeta: import("./nsga2").PopulationMeta,
		onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void
	): void {
		const frontIdx = popMeta.paretoRank.reduce((acc, rank, idx) => {
			if (rank === 0) {
				acc.push(idx);
			}
			return acc;
		}, [] as number[]);
		if (
			this._archive.update(
				frontIdx.map((idx) => popWithMeta[idx]),
				frontIdx.map((idx) => objectives[idx])
			)
		) {
			onArchiveUpdate?.(this._archive.members);
		}
	}

	reset(): void {
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}
}
