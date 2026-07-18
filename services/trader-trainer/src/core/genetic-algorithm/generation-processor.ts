import { adaptGAControl } from "./adaptive-control-system";
import { createDefaultGenome } from "./factory";
import { FitnessEvaluator } from "./fitness-evaluator";
import type { GARunnerConfig, GenerationContext } from "./generation-types";
import type { GAControlGenome, LamarckGenome, PopMember } from "./genome-types";
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

	get population(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	get generation(): number {
		return this._generation;
	}
	getArchiveMembers(): DeepReadonly<LamarckGenome>[] {
		return this._evaluator.getArchiveMembers();
	}
	get lastBestGenome(): DeepReadonly<LamarckGenome> | undefined {
		return this.getArchiveMembers()[0];
	}
	get bestFitness(): number {
		return this._evaluator.getBestFitness();
	}
	get stagnation(): number {
		return this._evaluator.getStagnation();
	}

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
		this._generation++;
		const { ctrl, rng } = this._initRunParams();
		const evalResult = await this._evaluator.evaluate(this._population);
		const paretoResult = buildParetoFronts(
			evalResult.updatedPop,
			evalResult.objectives,
			evalResult.metas,
			rng
		);
		this._evaluator.updateArchive(
			paretoResult.popWithMeta,
			evalResult.objectives,
			paretoResult.popMeta,
			this._cfg.onArchiveUpdate
		);
		const newCtrl = this._adaptControl(ctrl);
		const trackResult = this._evaluator.trackStagnation(
			paretoResult.popWithMeta,
			evalResult.metas,
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
		return ctx;
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
			this._evaluator.getEfficiencyHistory(),
			this._evaluator.getStagnation()
		);
	}

	private _evolvePopulation(params: {
		result: {
			popWithMeta: PopMember[];
			popMeta: import("./pareto").PopulationMeta;
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
		});
	}

	private _buildContext(params: {
		result: { avgFit: number; avgEff: number; popWithMeta: PopMember[] };
		trackResult: import("./stagnation-tracker").TrackResult | undefined;
		newCtrl: DeepReadonly<GAControlGenome>;
		startTime?: number;
	}): GenerationContext {
		const { result, trackResult, newCtrl, startTime } = params;
		return {
			generation: this._generation,
			population: this._population,
			archive: this._evaluator.getArchiveMembers(),
			bestFitness: this._evaluator.getBestFitness(),
			bestGenome:
				trackResult?.genome ??
				(this._population[0] as DeepReadonly<LamarckGenome>),
			bestFitnessMeta: trackResult?.meta,
			avgFitness: result.avgFit,
			efficiencyScore: result.avgEff,
			elapsedMs: Date.now() - (startTime ?? Date.now()),
			stagnation: this._evaluator.getStagnation(),
			gaControl: newCtrl,
		};
	}
}
