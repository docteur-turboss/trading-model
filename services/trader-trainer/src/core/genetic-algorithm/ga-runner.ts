import { adaptGAControl } from "./adaptive-control-system";
import { evaluateFitness } from "./evaluation-pipeline";
import { createDefaultGenome } from "./factory";
import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { selectElites } from "./offspring-factory";
import { ParetoArchive } from "./pareto-engine";
import { buildParetoFronts, sortPopulation } from "./pareto-processor";
import {
	buildNextPopulation,
	createInitialPopulation,
} from "./population-builder";
import { makePRNG } from "./prng";
import type { BackendFactory } from "./rl-backend";
import { type DeepReadonly, deepFreeze } from "./shared-types";
import { StagnationTracker } from "./stagnation-tracker";

export interface WindowSet {
	id: string;
	train: MarketStep[];
	validation: MarketStep[];
}

export interface GARunnerConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	evalConcurrency?: number;
	onGeneration?: (ctx: GenerationContext) => void;
	onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
	initialControl?: Partial<GAControlGenome>;
}

export interface GenerationContext {
	generation: number;
	population: DeepReadonly<LamarckGenome>[];
	archive: DeepReadonly<LamarckGenome>[];
	bestFitness: number;
	bestGenome: DeepReadonly<LamarckGenome>;
	avgFitness: number;
	efficiencyScore: number;
	elapsedMs: number;
	stagnation: number;
	gaControl: DeepReadonly<GAControlGenome>;
}

export interface ParetoFrontContext {
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
	rng: () => number;
}

export class GeneticAlgorithmRunner {
	private _population: DeepReadonly<LamarckGenome>[] = [];
	private _generation = 0;
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();

	constructor(private readonly _cfg: GARunnerConfig) {}

	public initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
		this._population = createInitialPopulation(ctrl);
		this._generation = 0;
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	public async runGeneration(startTime?: number): Promise<GenerationContext> {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);

		const { updatedPop, objectives, metas } = await this._evaluateFitness();
		const { popWithMeta, popMeta, avgFit, avgEff } = buildParetoFronts(
			updatedPop,
			objectives,
			metas,
			rng
		);

		this._updateArchive(popWithMeta, objectives, popMeta);
		const newCtrl = adaptGAControl(
			ctrl,
			this._stagnationTracker.efficiencyHistory,
			this._stagnationTracker.stagnation
		);

		this._stagnationTracker.track(popWithMeta, metas, avgEff);

		const ranked = sortPopulation(popWithMeta, popMeta);
		const elites = selectElites(ranked, newCtrl);
		this._population = buildNextPopulation(elites, {
			ranked,
			newCtrl,
			ctrl,
			rng,
			generation: this._generation,
		});

		const ctx: GenerationContext = {
			generation: this._generation,
			population: this._population,
			archive: this._archive.members,
			bestFitness: this._stagnationTracker.bestFitness,
			bestGenome: this._stagnationTracker
				.bestGenome as DeepReadonly<LamarckGenome>,
			avgFitness: avgFit,
			efficiencyScore: avgEff,
			elapsedMs: Date.now() - (startTime ?? Date.now()),
			stagnation: this._stagnationTracker.stagnation,
			gaControl: newCtrl,
		};

		this._cfg.onGeneration?.(ctx);
		return ctx;
	}

	private async _evaluateFitness(): Promise<{
		updatedPop: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
	}> {
		return evaluateFitness({
			population: this._population,
			windowSets: this._cfg.windowSets,
			backendFactory: this._cfg.backendFactory,
			concurrency: this._cfg.evalConcurrency ?? 4,
		});
	}

	private _updateArchive(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		popMeta: import("./nsga2").PopulationMeta
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
			this._cfg.onArchiveUpdate?.(this._archive.members);
		}
	}

	public async run(): Promise<DeepReadonly<LamarckGenome>> {
		this.initialise(this._cfg.initialControl);
		const startTime = Date.now();

		while (true) {
			const ctx = await this.runGeneration(startTime);
			if (
				ctx.bestFitness >= ctx.gaControl.rewardThreshold ||
				ctx.stagnation >= ctx.gaControl.stagnationPatience ||
				ctx.generation >= ctx.gaControl.maxGenerations ||
				ctx.elapsedMs >= ctx.gaControl.timeBudgetMs
			) {
				break;
			}
		}

		return (
			this._archive.members[0] ??
			this._stagnationTracker.bestGenome ??
			this._population[0]
		);
	}

	public getPopulation(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	public getBestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._stagnationTracker.bestGenome;
	}
	public getArchive(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}
	public getGeneration(): number {
		return this._generation;
	}
}
