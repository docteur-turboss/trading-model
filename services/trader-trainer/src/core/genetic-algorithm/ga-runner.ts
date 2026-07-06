import { adaptGAControl } from "./adaptive-control-system";
import { evaluateFitness } from "./evaluation-pipeline";
import { createDefaultGenome } from "./factory";
import type {
	GAControlGenome,
	Genome,
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
	private _startTime = 0;
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();

	constructor(private readonly _cfg: GARunnerConfig) {}

	public initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = this._freezeControl(baseControl);
		this._population = this._createInitialPopulation(ctrl);
		this._resetState();
	}

	private _freezeControl(
		baseControl?: Partial<GAControlGenome>
	): DeepReadonly<GAControlGenome> {
		return deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
	}

	private _createInitialPopulation(
		ctrl: DeepReadonly<GAControlGenome>
	): DeepReadonly<LamarckGenome>[] {
		return createInitialPopulation(ctrl);
	}

	private _resetState(): void {
		this._generation = 0;
		this._startTime = Date.now();
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	public async runGeneration(): Promise<GenerationContext> {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);

		const { updatedPop, objectives, metas } = await this._evaluateFitness();
		const { popWithMeta, popMeta, avgFit, avgEff } = this._buildParetoFronts(
			updatedPop,
			objectives,
			metas,
			rng
		);

		this._updateArchive(popWithMeta, objectives, popMeta);
		const newCtrl = this._adaptControl(ctrl);

		this._stagnationTracker.track(popWithMeta, metas, avgEff);

		const ranked = this._sortPopulation(popWithMeta, popMeta);
		const elites = selectElites(ranked, newCtrl);
		this._population = this._buildNextPopulation(
			elites,
			ranked,
			newCtrl,
			ctrl,
			rng
		);

		return this._buildContext(newCtrl, avgFit, avgEff);
	}

	private _adaptControl(
		ctrl: DeepReadonly<GAControlGenome>
	): Readonly<GAControlGenome> {
		return adaptGAControl(
			ctrl,
			this._stagnationTracker.efficiencyHistory,
			this._stagnationTracker.stagnation
		);
	}

	private _buildNextPopulation(
		elites: DeepReadonly<LamarckGenome>[],
		ranked: Genome[],
		newCtrl: Readonly<GAControlGenome>,
		ctrl: DeepReadonly<GAControlGenome>,
		rng: () => number
	): DeepReadonly<LamarckGenome>[] {
		return buildNextPopulation(
			elites,
			ranked,
			newCtrl,
			ctrl,
			rng,
			this._generation
		);
	}

	private _buildContext(
		newCtrl: Readonly<GAControlGenome>,
		avgFit: number,
		avgEff: number
	): GenerationContext {
		const ctx: GenerationContext = {
			generation: this._generation,
			population: this._population,
			archive: this._archive.members,
			bestFitness: this._stagnationTracker.bestFitness,
			bestGenome: this._stagnationTracker
				.bestGenome as DeepReadonly<LamarckGenome>,
			avgFitness: avgFit,
			efficiencyScore: avgEff,
			elapsedMs: Date.now() - this._startTime,
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
		const concurrency = this._cfg.evalConcurrency ?? 4;

		return evaluateFitness({
			population: this._population,
			windowSets: this._cfg.windowSets,
			backendFactory: this._cfg.backendFactory,
			concurrency,
		});
	}

	private _buildParetoFronts(
		updatedPop: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		metas: GenomeFitnessMeta[],
		rng: () => number
	): {
		popWithMeta: DeepReadonly<LamarckGenome>[];
		popMeta: import("./nsga2").PopulationMeta;
		avgFit: number;
		avgEff: number;
	} {
		return buildParetoFronts(updatedPop, objectives, metas, rng);
	}

	private _sortPopulation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		popMeta: import("./nsga2").PopulationMeta
	): Genome[] {
		return sortPopulation(popWithMeta, popMeta);
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

	private _shouldStop(ctx: GenerationContext): boolean {
		const ctrl = ctx.gaControl;
		return (
			ctx.bestFitness >= ctrl.rewardThreshold ||
			ctx.stagnation >= ctrl.stagnationPatience ||
			ctx.generation >= ctrl.maxGenerations ||
			ctx.elapsedMs >= ctrl.timeBudgetMs
		);
	}

	private _getBestResult(): DeepReadonly<LamarckGenome> {
		return (
			this._archive.members[0] ??
			this._stagnationTracker.bestGenome ??
			this._population[0]
		);
	}

	public async run(): Promise<DeepReadonly<LamarckGenome>> {
		this.initialise(this._cfg.initialControl);

		while (true) {
			const ctx = await this.runGeneration();
			if (this._shouldStop(ctx)) {
				break;
			}
		}

		return this._getBestResult();
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
