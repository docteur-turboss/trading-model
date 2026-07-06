import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { type DeepReadonly } from "./shared-types";
import { GenerationProcessor } from "./generation-processor";
import type { GenerationContext, GARunnerConfig } from "./generation-processor";

export type { WindowSet, GARunnerConfig, GenerationContext } from "./generation-processor";

export interface ParetoFrontContext {
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
	rng: () => number;
}

export class GeneticAlgorithmRunner {
	private readonly _processor: GenerationProcessor;

	constructor(private readonly _cfg: GARunnerConfig) {
		this._processor = new GenerationProcessor(_cfg);
	}

	public initialise(baseControl?: Partial<GAControlGenome>): void {
		this._processor.initialise(baseControl);
	}

	public async runGeneration(startTime?: number): Promise<GenerationContext> {
		return this._processor.runGeneration(startTime);
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
			this._processor.archive.members[0] ??
			this._processor.lastBestGenome ??
			this._processor.population[0]
		);
	}

	public getPopulation(): DeepReadonly<LamarckGenome>[] {
		return this._processor.population;
	}
	public getBestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._processor.lastBestGenome ?? null;
	}
	public getArchive(): DeepReadonly<LamarckGenome>[] {
		return this._processor.archive.members;
	}
	public getGeneration(): number {
		return this._processor.generation;
	}
}
