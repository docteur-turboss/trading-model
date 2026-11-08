import { evaluateFitness } from "./evaluation-pipeline";
import type { GaTelemetry } from "./ga-telemetry";
import type { WindowSet } from "./generation-types";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
	PopMember,
} from "./genome-types";
import type { ObjectiveVector } from "./pareto";
import { type ArchiveBest, ParetoArchive } from "./pareto";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { StagnationTracker, type TrackResult } from "./stagnation-tracker";

interface FitnessEvaluatorConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	telemetry?: GaTelemetry;
}

export class FitnessEvaluator {
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();
	private readonly _windowSets: WindowSet[];
	private readonly _backendFactory: BackendFactory;
	private readonly _telemetry: GaTelemetry | undefined;

	constructor(config: FitnessEvaluatorConfig) {
		this._windowSets = config.windowSets;
		this._backendFactory = config.backendFactory;
		this._telemetry = config.telemetry;
	}

	getArchiveMembers(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}

	/** Front member with the highest fitness under the run's fitness type. */
	getArchiveBest(): ArchiveBest | undefined {
		return this._archive.best();
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
		avgEff: number
	): TrackResult | undefined {
		return this._stagnationTracker.track(popWithMeta, avgEff);
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
			telemetry: this._telemetry,
		});
	}

	updateArchive(
		popWithMeta: PopMember[],
		objectives: ObjectiveVector[],
		popMeta: import("./pareto").PopulationMeta,
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
				frontIdx.map((idx) => objectives[idx]),
				frontIdx.map((idx) => ({
					fitness: popWithMeta[idx].fitness,
					meta: popWithMeta[idx].fitnessMeta,
				}))
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
