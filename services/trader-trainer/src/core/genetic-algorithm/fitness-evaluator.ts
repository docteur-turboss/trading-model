import { evaluateFitness } from "./evaluation-pipeline";
import type { WindowSet } from "./generation-types";
import type { GenomeFitnessMeta, LamarckGenome, PopMember } from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { ParetoArchive } from "./pareto";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { StagnationTracker } from "./stagnation-tracker";

export interface FitnessEvaluatorConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	evalConcurrency: number;
}

export class FitnessEvaluator {
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();
	private readonly _windowSets: WindowSet[];
	private readonly _backendFactory: BackendFactory;
	private readonly _evalConcurrency: number;

	constructor(config: FitnessEvaluatorConfig) {
		this._windowSets = config.windowSets;
		this._backendFactory = config.backendFactory;
		this._evalConcurrency = config.evalConcurrency;
	}

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
		popWithMeta: PopMember[],
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
				frontIdx.map((idx) => popWithMeta[idx].genome),
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
