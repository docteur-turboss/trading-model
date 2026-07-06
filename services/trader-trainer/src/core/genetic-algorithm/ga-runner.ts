import { adaptGAControl } from "./adaptive-control-system";
import { createDefaultGenome } from "./factory";
import type {
	GAControlGenome,
	Genome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { buildPopulationMeta } from "./nsga2";
import { createOffspring, selectElites } from "./offspring-factory";
import { evaluateFitness } from "./training-phase";
import { ParetoArchive } from "./pareto-engine";
import { makePRNG } from "./prng";
import { StagnationTracker } from "./stagnation-tracker";
import type { BackendFactory, RLBackend } from "./rl-backend";
import { deepFreeze, type DeepReadonly, withGenome } from "./shared-types";

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

	private _freezeControl(baseControl?: Partial<GAControlGenome>): DeepReadonly<GAControlGenome> {
		return deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
	}

	private _createInitialPopulation(ctrl: DeepReadonly<GAControlGenome>): DeepReadonly<LamarckGenome>[] {
		return Array.from(
			{ length: ctrl.populationSize },
			(_unused, index) => {
				const baseGenome = createDefaultGenome(`g0_${index}`, 0) as LamarckGenome;
				return deepFreeze({
					...baseGenome,
					gaControl: ctrl,
					trainedWeights: undefined,
				}) as DeepReadonly<LamarckGenome>;
			}
		);
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
		const { popWithMeta, popMeta, avgFit, avgEff } = this._buildParetoFronts({ updatedPop, objectives, metas, rng });

		this._updateArchive(popWithMeta, objectives, popMeta);
		const newCtrl = this._adaptControl(ctrl);

		this._stagnationTracker.track(popWithMeta, metas, avgEff);

		const ranked = this._sortPopulation(popWithMeta, popMeta);
		const elites = selectElites(ranked, newCtrl);
		this._population = this._buildNextPopulation(elites, ranked, newCtrl, ctrl, rng);

		return this._buildContext(newCtrl, avgFit, avgEff);
	}

	private _adaptControl(ctrl: DeepReadonly<GAControlGenome>): Readonly<GAControlGenome> {
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
		const offspring = createOffspring({ ranked, newCtrl, ctrl, rng, generation: this._generation });
		return [...elites, ...offspring].slice(0, newCtrl.populationSize);
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
			bestGenome: this._stagnationTracker.bestGenome as DeepReadonly<LamarckGenome>,
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
		ctx: ParetoFrontContext
	): {
		popWithMeta: DeepReadonly<LamarckGenome>[];
		popMeta: import("./nsga2").PopulationMeta;
		avgFit: number;
		avgEff: number;
	} {
		const { updatedPop, objectives, metas, rng } = ctx;
		const popMeta = buildPopulationMeta(objectives, rng);

		const popWithMeta = updatedPop.map((genome, idx) =>
			withGenome(genome, {
				fitness: metas[idx].efficiencyScore,
				fitnessMeta: metas[idx],
			} as Partial<LamarckGenome>)
		);

		const avgFit =
			popWithMeta.reduce((sum, genome) => sum + (genome.fitness ?? 0), 0) /
			popWithMeta.length;
		const avgEff =
			metas.reduce((sum, meta) => sum + meta.efficiencyScore, 0) / metas.length;

		return { popWithMeta, popMeta, avgFit, avgEff };
	}

	private _sortPopulation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		popMeta: import("./nsga2").PopulationMeta
	): Genome[] {
		const sortedIdx = Array.from(
			{ length: popWithMeta.length },
			(_unused, idx) => idx
		).sort((idxA, idxB) =>
			popMeta.paretoRank[idxA] === popMeta.paretoRank[idxB]
				? popMeta.crowdingDist[idxB] - popMeta.crowdingDist[idxA]
				: popMeta.paretoRank[idxA] - popMeta.paretoRank[idxB]
		);

		return sortedIdx.map((idx) => popWithMeta[idx] as Genome);
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

		while (true) {
			const ctx = await this.runGeneration();
			const ctrl = ctx.gaControl;
			if (ctx.bestFitness >= ctrl.rewardThreshold) {
				break;
			}
			if (ctx.stagnation >= ctrl.stagnationPatience) {
				break;
			}
			if (ctx.generation >= ctrl.maxGenerations) {
				break;
			}
			if (ctx.elapsedMs >= ctrl.timeBudgetMs) {
				break;
			}
		}

		return this._archive.members[0] ?? this._stagnationTracker.bestGenome ?? this._population[0];
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
