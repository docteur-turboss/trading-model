import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import type { BackendFactory } from "./rl-backend";
import { type DeepReadonly } from "./shared-types";
import { GaPopulationBuilder } from "./ga-population-builder";
import { GaGenerationRunner } from "./ga-generation-runner";

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
	private _populationBuilder = new GaPopulationBuilder();
	private _generationRunner: GaGenerationRunner;

	constructor(private readonly _cfg: GARunnerConfig) {
		this._generationRunner = new GaGenerationRunner({
			windowSets: _cfg.windowSets,
			backendFactory: _cfg.backendFactory,
			evalConcurrency: _cfg.evalConcurrency,
			onGeneration: _cfg.onGeneration,
			onArchiveUpdate: _cfg.onArchiveUpdate,
		});
	}

	public initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = this._populationBuilder.freezeControl(baseControl);
		this._population = this._populationBuilder.createInitialPopulation(ctrl);
		this._generationRunner.reset();
	}

	public async runGeneration(): Promise<GenerationContext> {
		const ctx = await this._generationRunner.runGeneration(this._population);
		this._population = ctx.population;
		return ctx;
	}

	public async run(): Promise<DeepReadonly<LamarckGenome>> {
		this.initialise(this._cfg.initialControl);

		while (true) {
			const ctx = await this.runGeneration();
			if (this._generationRunner.shouldStop(ctx)) {
				break;
			}
		}

		return this._generationRunner.getBestResult(this._population);
	}

	public getPopulation(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	public getBestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._generationRunner.stagnationTracker.bestGenome;
	}
	public getArchive(): DeepReadonly<LamarckGenome>[] {
		return this._generationRunner.archive.members;
	}
	public getGeneration(): number {
		return this._generationRunner.generation;
	}
}
