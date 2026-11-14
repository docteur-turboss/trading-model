import { getLogger } from "@trading-model/contracts/logger-registry";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { DurationMs } from "@trading-model/primitives/primitives";
import { evalPhase } from "../domain/genetic-algorithm/evaluation-phase";
import {
	barsPerYear,
	computeAllResults,
} from "../domain/genetic-algorithm/evaluation-utils";
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

export interface TrainingSessionResult {
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: number;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: number;
}

/**
 * Runs one training session. The in-process default blocks the caller's event
 * loop; the composition root injects the worker-thread runner (issue #508).
 */
export type TrainingRunner = (
	windowSets: WindowSet[],
	settings: TrainingSettings,
	telemetry?: GaTelemetry,
	/** Aborted: the session ends after its current generation (ADR-0058). */
	signal?: AbortSignal
) => Promise<TrainingSessionResult>;

/** Runs the session on the calling thread. */
export const runInProcess: TrainingRunner = (
	windowSets,
	settings,
	telemetry,
	signal
) => new TrainingSession(windowSets, settings, telemetry, signal).run();

class TrainingSession {
	constructor(
		private readonly _windowSets: WindowSet[],
		private readonly _settings: TrainingSettings,
		private readonly _telemetry?: GaTelemetry,
		private readonly _signal?: AbortSignal
	) {}

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
		// Fitness and metrics of the published genome itself, not of the best
		// scalar seen during the run (which may sit off the Pareto front).
		const published = runner.processor.archiveBest;
		const ctx = lastCtx as GenerationContext | null;
		const selectionMeta = published?.meta ?? ctx?.bestFitnessMeta;
		return {
			bestGenome,
			bestFitness: published?.fitness ?? ctx?.bestFitness ?? 0,
			bestFitnessMeta: this._testMeta(bestGenome) ?? selectionMeta,
			generation: runner.processor.generation,
		};
	}

	/**
	 * Scores the published genome once on the test segment, which the training
	 * and the selection never read (ADR-0068). Undefined without a test segment.
	 */
	private _testMeta(
		genome: DeepReadonly<LamarckGenome>
	): GenomeFitnessMeta | undefined {
		const test = this._windowSets[this._windowSets.length - 1]?.test;
		if (!test?.length) {
			return undefined;
		}
		const t0 = Date.now();
		const pnl = evalPhase({
			genome,
			validationData: test,
			backendFactory: makeSeededBackendFactory(
				genome.gaControl.seeding.networkSeed,
				{ observePosition: this._settings.observePosition ?? true }
			),
		});
		const { meta } = computeAllResults({
			currentGenome: genome,
			...pnl,
			failed: false,
			t0,
			barsPerYear: barsPerYear(test),
		});
		return { ...meta, evaluatedOn: "test" };
	}

	private _buildInitialControl(): GAControlGenome {
		const defaultControl = createDefaultGenome("ctrl").gaControl;
		const offset = this._settings.seedOffset ?? 0;
		return {
			...defaultControl,
			seeding: {
				envSeed: defaultControl.seeding.envSeed + offset,
				mutationSeed: defaultControl.seeding.mutationSeed + offset,
				networkSeed: defaultControl.seeding.networkSeed + offset,
			},
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
			fitnessType: this._settings.fitnessType,
		};
	}

	private _createRunner(
		onGeneration: (ctx: GenerationContext) => void
	): GeneticAlgorithmRunner {
		const initialControl = this._buildInitialControl();
		return new GeneticAlgorithmRunner({
			windowSets: this._windowSets,
			backendFactory: makeSeededBackendFactory(
				initialControl.seeding.networkSeed,
				{ observePosition: this._settings.observePosition ?? true }
			),
			initialControl,
			onGeneration,
			telemetry: this._telemetry,
			signal: this._signal,
		});
	}
}
