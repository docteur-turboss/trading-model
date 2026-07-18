import { checkTerminationConditions } from "./adaptive-control-system";
import type { GARunnerConfig, GenerationContext } from "./generation-processor";
import { GenerationProcessor } from "./generation-processor";
import type { GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import type { DeepReadonly } from "./shared-types";

export type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./generation-processor";

export interface ParetoFrontContext {
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
	rng: () => number;
}

export class GeneticAlgorithmRunner {
	public readonly processor: GenerationProcessor;

	constructor(private readonly _cfg: GARunnerConfig) {
		this.processor = new GenerationProcessor(_cfg);
	}

	public async run(): Promise<DeepReadonly<LamarckGenome>> {
		this.processor.initialise(this._cfg.initialControl);
		const startTime = Date.now();

		while (true) {
			const ctx = await this.processor.runGeneration(startTime);
			if (this._shouldTerminate(ctx)) {
				break;
			}
		}

		return this._bestGenome();
	}

	private _shouldTerminate(ctx: GenerationContext): boolean {
		return checkTerminationConditions({
			generation: ctx.generation,
			bestFitness: ctx.bestFitness,
			stagnation: ctx.stagnation,
			elapsedMs: ctx.elapsedMs,
			ctrl: ctx.gaControl,
		}).shouldStop;
	}

	private _bestGenome(): DeepReadonly<LamarckGenome> {
		return (
			this.processor.getArchiveMembers()[0] ?? this.processor.population[0]
		);
	}
}
