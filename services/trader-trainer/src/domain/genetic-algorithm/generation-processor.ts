import { makePRNG } from "@trading-model/crypto/domain/services/prng";
import { evaluateFitness } from "./evaluation-pipeline";
import { createDefaultGenome } from "./factory";
import { type GaTelemetry, NoopGaTelemetry } from "./ga-telemetry";
import type { GARunnerConfig, GenerationContext } from "./generation-types";
import { adaptGAControl } from "./genome-control";
import type { GAControlGenome, LamarckGenome, PopMember } from "./genome-types";
import { selectElites } from "./offspring-factory";
import { type ArchiveBest, ParetoArchive } from "./pareto/archive";
import type { ObjectiveVector } from "./pareto/domination";
import type { PopulationMeta } from "./pareto/nsga2";
import { buildParetoFronts, sortPopulation } from "./pareto-processor";
import {
	buildNextPopulation,
	createInitialPopulation,
} from "./population-builder";
import { type DeepReadonly, deepFreeze } from "./shared-types";
import { StagnationTracker, type TrackResult } from "./stagnation-tracker";

export type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./generation-types";

export class GenerationProcessor {
	private _population: DeepReadonly<LamarckGenome>[] = [];
	private _generation = 0;
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();
	private readonly _telemetry: GaTelemetry;

	constructor(private readonly _cfg: GARunnerConfig) {
		this._telemetry = _cfg.telemetry ?? NoopGaTelemetry;
	}

	get population(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	get generation(): number {
		return this._generation;
	}
	getArchiveMembers(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}
	/** Front member with the highest fitness: the genome a run publishes. */
	get archiveBest(): ArchiveBest | undefined {
		return this._archive.best();
	}
	get lastBestGenome(): DeepReadonly<LamarckGenome> | undefined {
		return this.archiveBest?.genome;
	}

	initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
		this._population = createInitialPopulation(ctrl);
		this._generation = 0;
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	async runGeneration(startTime?: number): Promise<GenerationContext> {
		this._generation++;
		this._telemetry.generationStarted(
			this._generation,
			this._population.length
		);
		const { ctrl, rng } = this._initRunParams();
		const evalResult = await evaluateFitness({
			population: this._population,
			windowSets: this._cfg.windowSets,
			backendFactory: this._cfg.backendFactory,
			telemetry: this._telemetry,
		});
		const paretoResult = buildParetoFronts(
			evalResult.updatedPop,
			evalResult.objectives,
			evalResult.metas,
			rng
		);
		this._updateArchive(
			paretoResult.popWithMeta,
			evalResult.objectives,
			paretoResult.popMeta
		);
		const newCtrl = this._adaptControl(ctrl);
		const trackResult = this._stagnationTracker.track(
			paretoResult.popWithMeta,
			paretoResult.avgEff
		);
		this._evolvePopulation({ result: paretoResult, newCtrl, ctrl, rng });
		const ctx = this._buildContext({
			result: paretoResult,
			trackResult,
			newCtrl,
			startTime,
		});
		this._cfg.onGeneration?.(ctx);
		this._telemetry.stagnationUpdated(ctx.stagnation);
		return ctx;
	}

	private _updateArchive(
		popWithMeta: PopMember[],
		objectives: ObjectiveVector[],
		popMeta: PopulationMeta
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
			this._cfg.onArchiveUpdate?.(this._archive.members);
		}
	}

	private _initRunParams(): {
		ctrl: DeepReadonly<GAControlGenome>;
		rng: () => number;
	} {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.seeding.mutationSeed + this._generation);
		return { ctrl, rng };
	}

	private _adaptControl(
		ctrl: DeepReadonly<GAControlGenome>
	): DeepReadonly<GAControlGenome> {
		return adaptGAControl(
			ctrl,
			this._stagnationTracker.efficiencyHistory,
			this._stagnationTracker.stagnation
		);
	}

	private _evolvePopulation(params: {
		result: {
			popWithMeta: PopMember[];
			popMeta: PopulationMeta;
		};
		newCtrl: DeepReadonly<GAControlGenome>;
		ctrl: DeepReadonly<GAControlGenome>;
		rng: () => number;
	}): void {
		const { result, newCtrl, ctrl, rng } = params;
		const ranked = sortPopulation(result.popWithMeta, result.popMeta);
		const elites = selectElites(ranked, newCtrl);
		this._population = buildNextPopulation(elites, {
			ranked,
			newCtrl,
			ctrl,
			rng,
			generation: this._generation,
			telemetry: this._telemetry,
		});
	}

	private _buildContext(params: {
		result: { avgFit: number; avgEff: number; popWithMeta: PopMember[] };
		trackResult: TrackResult | undefined;
		newCtrl: DeepReadonly<GAControlGenome>;
		startTime?: number;
	}): GenerationContext {
		const { result, trackResult, newCtrl, startTime } = params;
		return {
			generation: this._generation,
			population: this._population,
			archive: this._archive.members,
			bestFitness: this._stagnationTracker.bestFitness,
			bestGenome:
				trackResult?.genome ??
				(this._population[0] as DeepReadonly<LamarckGenome>),
			bestFitnessMeta: trackResult?.meta,
			avgFitness: result.avgFit,
			efficiencyScore: result.avgEff,
			elapsedMs: Date.now() - (startTime ?? Date.now()),
			stagnation: this._stagnationTracker.stagnation,
			gaControl: newCtrl,
		};
	}
}
