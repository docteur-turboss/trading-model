import { logger } from "@trading-model/common/config/logger";
import type { PositiveInt } from "@trading-model/common/domain/primitives";
import { DurationMs } from "@trading-model/common/domain/primitives";
import { ENV } from "../infrastructure/config/env";
import { createDefaultGenome } from "./genetic-algorithm/factory";
import {
	type GenerationContext,
	GeneticAlgorithmRunner,
	type WindowSet,
} from "./genetic-algorithm/ga-runner";
import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
} from "./genetic-algorithm/genome-types";
import { makeTradingAgentBackend } from "./genetic-algorithm/rl-backend";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";

export type { GenerationContext } from "./genetic-algorithm/ga-runner";

export interface TrainingSessionResult {
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: number;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: number;
	generationContext: GenerationContext | null;
}

export class TrainingSession {
	private readonly _windowSet: WindowSet;

	constructor(windowSet: WindowSet) {
		this._windowSet = windowSet;
	}

	async run(): Promise<TrainingSessionResult> {
		let lastCtx: GenerationContext | null = null;

		const runner = this._createRunner((ctx) => {
			lastCtx = ctx;
			logger.info("Generation completed", {
				context: {
					generation: ctx.generation,
					bestFitness: ctx.bestFitness,
					avgFitness: ctx.avgFitness,
					archiveSize: ctx.archive.length,
					stagnation: ctx.stagnation,
					elapsedSec: ctx.elapsedMs / 1000,
				},
			});
		});

		const bestGenome = await runner.run();
		return {
			bestGenome,
			bestFitness: (lastCtx as GenerationContext | null)?.bestFitness ?? 0,
			bestFitnessMeta: (lastCtx as GenerationContext | null)?.bestFitnessMeta,
			generation: runner.processor.generation,
			generationContext: lastCtx,
		};
	}

	private _buildInitialControl(): Partial<GAControlGenome> {
		const defaultControl = createDefaultGenome("ctrl").gaControl;
		return {
			...defaultControl,
			population: {
				...defaultControl.population,
				size: ENV.TRAINER_POPULATION_SIZE as PositiveInt,
			},
			termination: {
				...defaultControl.termination,
				maxGenerations: ENV.TRAINER_GENERATIONS as PositiveInt,
				timeBudgetMs: DurationMs.of(ENV.TRAINER_TIME_BUDGET_MS),
			},
			evaluation: {
				...defaultControl.evaluation,
				episodesPerIndividual:
					ENV.TRAINER_EPISODES_PER_INDIVIDUAL as PositiveInt,
			},
		};
	}

	private _createRunner(
		onGeneration: (ctx: GenerationContext) => void
	): GeneticAlgorithmRunner {
		return new GeneticAlgorithmRunner({
			windowSets: [this._windowSet],
			backendFactory: makeTradingAgentBackend,
			evalConcurrency: 4,
			initialControl: this._buildInitialControl(),
			onGeneration,
		});
	}
}
