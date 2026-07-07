import { adaptGAControl } from "./adaptive-control-system";
import { createDefaultGenome } from "./factory";
import { FitnessEvaluator } from "./fitness-evaluator";
import type { GARunnerConfig, GenerationContext } from "./generation-types";
import type { GAControlGenome, LamarckGenome } from "./genome-types";
import { selectElites } from "./offspring-factory";
import { buildParetoFronts, sortPopulation } from "./pareto-processor";
import {
	buildNextPopulation,
	createInitialPopulation,
} from "./population-builder";
import { makePRNG } from "./prng";
import { type DeepReadonly, deepFreeze } from "./shared-types";

export type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./generation-types";

export class GenerationProcessor {
	private _population: DeepReadonly<LamarckGenome>[] = [];
	private _generation = 0;
	private readonly _evaluator: FitnessEvaluator;

	constructor(private readonly _cfg: GARunnerConfig) {
		this._evaluator = new FitnessEvaluator({
			windowSets: _cfg.windowSets,
			backendFactory: _cfg.backendFactory,
			evalConcurrency: _cfg.evalConcurrency ?? 4,
		});
	}

	get population(): DeepReadonly<LamarckGenome>[] { return this._population; }
	get generation(): number { return this._generation; }
	get archive(): import("./pareto").ParetoArchive { return this._evaluator.archive; }
	get lastBestGenome(): DeepReadonly<LamarckGenome> | undefined { return this._evaluator.archive.members[0]; }
	get bestFitness(): number { return this._evaluator.stagnationTracker.bestFitness; }
	get stagnation(): number { return this._evaluator.stagnationTracker.stagnation; }

	initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
		this._population = createInitialPopulation(ctrl);
		this._generation = 0;
		this._evaluator.reset();
	}

	async runGeneration(startTime?: number): Promise<GenerationContext> {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);
		const evalResult = await this._evaluator.evaluate(this._population);
		const { updatedPop, objectives, metas } = evalResult;
		const result = buildParetoFronts(updatedPop, objectives, metas, rng);
		this._evaluator.updateArchive(result.popWithMeta, objectives, result.popMeta, this._cfg.onArchiveUpdate);
		const newCtrl = adaptGAControl(ctrl, this._evaluator.stagnationTracker.efficiencyHistory, this._evaluator.stagnationTracker.stagnation);
		const lastBestGenome = this._evaluator.stagnationTracker.track(result.popWithMeta, evalResult.metas, result.avgEff);
		const ranked = sortPopulation(result.popWithMeta, result.popMeta);
		const elites = selectElites(ranked, newCtrl);
		this._population = buildNextPopulation(elites, { ranked, newCtrl, ctrl, rng, generation: this._generation });
		const ctx: GenerationContext = {
			generation: this._generation,
			population: this._population,
			archive: this._evaluator.archive.members,
			bestFitness: this._evaluator.stagnationTracker.bestFitness,
			bestGenome: lastBestGenome ?? this._population[0] as DeepReadonly<LamarckGenome>,
			avgFitness: result.avgFit,
			efficiencyScore: result.avgEff,
			elapsedMs: Date.now() - (startTime ?? Date.now()),
			stagnation: this._evaluator.stagnationTracker.stagnation,
			gaControl: newCtrl,
		};
		this._cfg.onGeneration?.(ctx);
		return ctx;
	}
}
