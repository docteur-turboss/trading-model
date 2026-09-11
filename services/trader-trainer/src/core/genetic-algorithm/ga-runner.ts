import { checkTerminationConditions } from "./adaptive-control-system";
import type { GARunnerConfig, GenerationContext } from "./generation-processor";
import { GenerationProcessor } from "./generation-processor";
import type { LamarckGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";

export type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./generation-processor";

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
