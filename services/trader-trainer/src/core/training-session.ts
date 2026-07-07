import { logger } from "@trading-model/common/config/logger";
import { ENV } from "../config/env";
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
		const ctx = lastCtx as GenerationContext | null;
		return {
			bestGenome,
			bestFitness: ctx?.bestFitness ?? 0,
			bestFitnessMeta: ctx?.bestFitnessMeta,
			generation: runner.getGeneration(),
			generationContext: ctx,
		};
	}

	private _buildInitialControl(): Partial<GAControlGenome> {
		const defaultControl = createDefaultGenome("ctrl").gaControl;
		return {
			...defaultControl,
			populationSize: env.TRAINER_POPULATION_SIZE,
			maxGenerations: env.TRAINER_GENERATIONS,
			timeBudgetMs: env.TRAINER_TIME_BUDGET_MS,
			episodesPerIndividual: env.TRAINER_EPISODES_PER_INDIVIDUAL,
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
