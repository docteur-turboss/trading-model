import { evaluateFitness } from "./evaluation-pipeline";
import type { GaTelemetry } from "./ga-telemetry";
import type { WindowSet } from "./generation-types";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
	PopMember,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { ParetoArchive } from "./pareto";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { StagnationTracker, type TrackResult } from "./stagnation-tracker";

export interface FitnessEvaluatorConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	evalConcurrency: number;
	telemetry?: GaTelemetry;
}

export class FitnessEvaluator {
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();
	private readonly _windowSets: WindowSet[];
	private readonly _backendFactory: BackendFactory;
	private readonly _evalConcurrency: number;
	private readonly _telemetry: GaTelemetry | undefined;

	constructor(config: FitnessEvaluatorConfig) {
		this._windowSets = config.windowSets;
		this._backendFactory = config.backendFactory;
		this._evalConcurrency = config.evalConcurrency;
		this._telemetry = config.telemetry;
	}

	getArchiveMembers(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}

	getArchiveSize(): number {
		return this._archive.size;
	}

	getBestFitness(): number {
		return this._stagnationTracker.bestFitness;
	}

	getStagnation(): number {
		return this._stagnationTracker.stagnation;
	}

	getEfficiencyHistory(): number[] {
		return this._stagnationTracker.efficiencyHistory;
	}

	trackStagnation(
		popWithMeta: PopMember[],
		metas: GenomeFitnessMeta[],
		avgEff: number
	): TrackResult | undefined {
		return this._stagnationTracker.track(popWithMeta, metas, avgEff);
	}

	evaluate(population: DeepReadonly<LamarckGenome>[]): Promise<{
		updatedPop: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
	}> {
		return evaluateFitness({
			population,
			windowSets: this._windowSets,
			backendFactory: this._backendFactory,
			concurrency: this._evalConcurrency,
			telemetry: this._telemetry,
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
