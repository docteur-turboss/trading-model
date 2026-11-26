import { makePRNG } from "@trading-model/crypto/prng";
import { AGENT_STATE_DIM } from "@trading-model/model-runtime/agent/agent-state";
import {
	evaluateFitness,
	evaluateGenomeAllWindows,
} from "./evaluation-pipeline";
import { createDefaultGenome } from "./factory";
import { type GaTelemetry, NoopGaTelemetry } from "./ga-telemetry";
import type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./generation-types";
import type { GAControlGenome, LamarckGenome, PopMember } from "./genome";
import { adaptGAControl } from "./genome-control";
import { selectElites } from "./offspring-factory";
import { type ArchiveBest, ParetoArchive } from "./pareto/archive";
import type { ObjectiveVector } from "./pareto/domination";
import type { PopulationMeta } from "./pareto/nsga2";
import { buildParetoFronts, sortPopulation } from "./pareto-processor";
import {
	buildNextPopulation,
	createInitialPopulation,
} from "./population-builder";
import { rotatingWindowSets } from "./shared-trunk";
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
	private _finalBest: ArchiveBest | undefined;
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
	/** Front member with the highest fitness: the genome a run publishes. */
	get archiveBest(): ArchiveBest | undefined {
		return this._finalBest ?? this._archive.best();
	}
	get lastBestGenome(): DeepReadonly<LamarckGenome> | undefined {
		return this.archiveBest?.genome;
	}

	initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
		const step = this._cfg.windowSets[0]?.train[0];
		this._population = createInitialPopulation(
			ctrl,
			this._cfg.eventDriven,
			step && step.features.toFloat32Array().length + AGENT_STATE_DIM,
			this._cfg.inputGroups?.length
		);
		this._generation = 0;
		this._finalBest = undefined;
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	/**
	 * With a rotating subset (k < N), archive fitnesses come from different
	 * symbol slices and are not comparable: score every front member on all
	 * symbols and publish the best of those (ADR-0076 step 1).
	 */
	async selectOnAllSymbols(): Promise<void> {
		const all = this._cfg.windowSets;
		const members = this._archive.members;
		if (
			rotatingWindowSets(all, this._cfg.symbolsPerGeneration, 0, 1) === all ||
			members.length === 0
		) {
			return;
		}
		const rng = makePRNG(members[0].gaControl.seeding.mutationSeed);
		let best: ArchiveBest | undefined;
		for (const member of members) {
			const { updatedGenome, meta } = await evaluateGenomeAllWindows(
				member,
				all,
				this._cfg.backendFactory,
				this._telemetry,
				rng
			);
			if (!best || meta.efficiencyScore > best.fitness) {
				best = { genome: updatedGenome, fitness: meta.efficiencyScore, meta };
			}
		}
		this._finalBest = best;
	}

	async runGeneration(startTime?: number): Promise<GenerationContext> {
		this._generation++;
		this._telemetry.generationStarted(this._generation);
		const { ctrl, rng } = this._initRunParams();
		const evalResult = await evaluateFitness({
			population: this._population,
			windowSets: rotatingWindowSets(
				this._cfg.windowSets,
				this._cfg.symbolsPerGeneration,
				this._cfg.initialControl?.seeding?.networkSeed ?? 0,
				this._generation
			) as WindowSet[],
			backendFactory: this._cfg.backendFactory,
			telemetry: this._telemetry,
			rng,
			shouldStop: () =>
				Date.now() - (startTime ?? Date.now()) >= ctrl.termination.timeBudgetMs,
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
			paretoResult.avgFit
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
		this._archive.update(
			frontIdx.map((idx) => popWithMeta[idx].genome),
			frontIdx.map((idx) => objectives[idx]),
			frontIdx.map((idx) => ({
				fitness: popWithMeta[idx].fitness,
				meta: popWithMeta[idx].fitnessMeta,
			}))
		);
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
			protectCandleGroup: this._cfg.protectCandleGroup,
		});
	}

	private _buildContext(params: {
		result: { avgFit: number; popWithMeta: PopMember[] };
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
			bestFitnessMeta: trackResult?.meta,
			avgFitness: result.avgFit,
			elapsedMs: Date.now() - (startTime ?? Date.now()),
			stagnation: this._stagnationTracker.stagnation,
			gaControl: newCtrl,
		};
	}
}
