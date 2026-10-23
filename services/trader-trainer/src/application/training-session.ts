import { getLogger } from "@trading-model/contracts/logger-registry";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { DurationMs } from "@trading-model/primitives/primitives";
import { createDefaultGenome } from "../domain/genetic-algorithm/factory";
import {
	type GenerationContext,
	GeneticAlgorithmRunner,
	type WindowSet,
} from "../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
} from "../domain/genetic-algorithm/genome-types";
import { makeSeededBackendFactory } from "../domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../domain/genetic-algorithm/shared-types";
import type { TrainingSettings } from "../domain/training-settings";

export type { GenerationContext } from "../domain/genetic-algorithm/ga-runner";

export interface TrainingSessionResult {
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: number;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: number;
	generationContext: GenerationContext | null;
}

export class TrainingSession {
	private readonly _windowSets: WindowSet[];

	constructor(
		windowSets: WindowSet | WindowSet[],
		private readonly _settings: TrainingSettings,
		private readonly _telemetry?: GaTelemetry
	) {
		this._windowSets = Array.isArray(windowSets) ? windowSets : [windowSets];
	}

	async run(): Promise<TrainingSessionResult> {
		let lastCtx: GenerationContext | null = null;

		const runner = this._createRunner((ctx) => {
			lastCtx = ctx;
			getLogger().info("Generation completed", {
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

	private _buildInitialControl(): GAControlGenome {
		const defaultControl = createDefaultGenome("ctrl").gaControl;
		return {
			...defaultControl,
			population: {
				...defaultControl.population,
				size: this._settings.populationSize as PositiveInt,
			},
			termination: {
				...defaultControl.termination,
				maxGenerations: this._settings.generations as PositiveInt,
				timeBudgetMs: DurationMs.of(this._settings.timeBudgetMs),
			},
			evaluation: {
				...defaultControl.evaluation,
				episodesPerIndividual: this._settings
					.episodesPerIndividual as PositiveInt,
			},
		};
	}

	private _createRunner(
		onGeneration: (ctx: GenerationContext) => void
	): GeneticAlgorithmRunner {
		const initialControl = this._buildInitialControl();
		return new GeneticAlgorithmRunner({
			windowSets: this._windowSets,
			backendFactory: makeSeededBackendFactory(
				initialControl.seeding.networkSeed
			),
			evalConcurrency: 4,
			initialControl,
			onGeneration,
			telemetry: this._telemetry,
		});
	}
}
