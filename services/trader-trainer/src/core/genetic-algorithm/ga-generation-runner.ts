import { adaptGAControl } from "./adaptive-control-system";
import type { GAControlGenome, Genome, GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { buildPopulationMeta } from "./nsga2";
import { createOffspring, selectElites } from "./offspring-factory";
import { evaluateFitness } from "./training-phase";
import { ParetoArchive } from "./pareto-engine";
import { makePRNG } from "./prng";
import { StagnationTracker } from "./stagnation-tracker";
import type { BackendFactory } from "./rl-backend";
import { type DeepReadonly, withGenome } from "./shared-types";
import type { GenerationContext, ParetoFrontContext, WindowSet } from "./ga-runner";

export class GaGenerationRunner {
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();
	private _generation = 0;
	private _startTime = Date.now();

	constructor(
		private readonly _cfg: {
			windowSets: WindowSet[];
			backendFactory: BackendFactory;
			evalConcurrency?: number;
			onGeneration?: (ctx: GenerationContext) => void;
			onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
		}
	) {}

	get archive(): ParetoArchive {
		return this._archive;
	}

	get stagnationTracker(): StagnationTracker {
		return this._stagnationTracker;
	}

	get generation(): number {
		return this._generation;
	}

	reset(): void {
		this._generation = 0;
		this._startTime = Date.now();
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	async runGeneration(population: DeepReadonly<LamarckGenome>[]): Promise<GenerationContext> {
		const ctrl = population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);

		const { updatedPop, objectives, metas } = await this.evaluateFitness(population);
		const { popWithMeta, popMeta, avgFit, avgEff } = this.buildParetoFronts({
			updatedPop,
			objectives,
			metas,
			rng,
		});

		this.updateArchive(popWithMeta, objectives, popMeta);
		const newCtrl = this.adaptControl(ctrl);

		this._stagnationTracker.track(popWithMeta, metas, avgEff);

		const ranked = this.sortPopulation(popWithMeta, popMeta);
		const elites = selectElites(ranked, newCtrl);
		const nextPop = this.buildNextPopulation(elites, ranked, newCtrl, ctrl, rng);

		this._generation++;

		return this.buildContext(nextPop, newCtrl, avgFit, avgEff);
	}

	async evaluateFitness(
		population: DeepReadonly<LamarckGenome>[]
	): Promise<{
		updatedPop: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
	}> {
		const concurrency = this._cfg.evalConcurrency ?? 4;

		return evaluateFitness({
			population,
			windowSets: this._cfg.windowSets,
			backendFactory: this._cfg.backendFactory,
			concurrency,
		});
	}

	buildParetoFronts(
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

	sortPopulation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		popMeta: import("./nsga2").PopulationMeta
	): Genome[] {
		const sortedIdx = Array.from({ length: popWithMeta.length }, (_unused, idx) => idx).sort(
			(idxA, idxB) =>
				popMeta.paretoRank[idxA] === popMeta.paretoRank[idxB]
					? popMeta.crowdingDist[idxB] - popMeta.crowdingDist[idxA]
					: popMeta.paretoRank[idxA] - popMeta.paretoRank[idxB]
		);

		return sortedIdx.map((idx) => popWithMeta[idx] as Genome);
	}

	updateArchive(
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

	adaptControl(ctrl: DeepReadonly<GAControlGenome>): Readonly<GAControlGenome> {
		return adaptGAControl(
			ctrl,
			this._stagnationTracker.efficiencyHistory,
			this._stagnationTracker.stagnation
		);
	}

	buildNextPopulation(
		elites: DeepReadonly<LamarckGenome>[],
		ranked: Genome[],
		newCtrl: Readonly<GAControlGenome>,
		ctrl: DeepReadonly<GAControlGenome>,
		rng: () => number
	): DeepReadonly<LamarckGenome>[] {
		const offspring = createOffspring({ ranked, newCtrl, ctrl, rng, generation: this._generation });
		return [...elites, ...offspring].slice(0, newCtrl.populationSize);
	}

	buildContext(
		population: DeepReadonly<LamarckGenome>[],
		newCtrl: Readonly<GAControlGenome>,
		avgFit: number,
		avgEff: number
	): GenerationContext {
		const ctx: GenerationContext = {
			generation: this._generation,
			population,
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

	shouldStop(ctx: GenerationContext): boolean {
		const ctrl = ctx.gaControl;
		return (
			ctx.bestFitness >= ctrl.rewardThreshold ||
			ctx.stagnation >= ctrl.stagnationPatience ||
			ctx.generation >= ctrl.maxGenerations ||
			ctx.elapsedMs >= ctrl.timeBudgetMs
		);
	}

	getBestResult(population: DeepReadonly<LamarckGenome>[]): DeepReadonly<LamarckGenome> {
		return this._archive.members[0] ?? this._stagnationTracker.bestGenome ?? population[0];
	}
}
