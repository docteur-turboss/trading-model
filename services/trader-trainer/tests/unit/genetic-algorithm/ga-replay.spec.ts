import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { setLogger } from "@trading-model/contracts/logger-registry";
import {
	DurationMs,
	type PositiveInt,
	Price,
} from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import {
	type GenerationContext,
	GeneticAlgorithmRunner,
	type WindowSet,
} from "../../../src/domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../../../src/domain/genetic-algorithm/ga-telemetry";
import { createGAControlGenome } from "../../../src/domain/genetic-algorithm/genome-control";
import type { MarketStep } from "../../../src/domain/genetic-algorithm/genome-types";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import { makeSeededBackendFactory } from "../../../src/domain/genetic-algorithm/rl-backend";

const INPUT_DIM = 32;
const GENERATIONS = 2;

function makeMarket(length: number, seed: number): MarketStep[] {
	const rng = makePRNG(seed);
	let price = 100;
	return Array.from({ length }, () => {
		price *= 1 + (rng() - 0.5) * 0.04;
		return {
			features: FeatureVector.fromFloat32Array(
				Float32Array.from({ length: INPUT_DIM }, () => rng() * 2 - 1)
			),
			price: Price.of(price),
		};
	});
}

const WINDOW_SETS: WindowSet[] = [
	{ id: "w1", train: makeMarket(24, 1), validation: makeMarket(12, 2) },
	{ id: "w2", train: makeMarket(24, 3), validation: makeMarket(12, 4) },
];

interface RunSummary {
	bestFitness: number[];
	populationIds: string[][];
	bestId: string;
	bestWeights: number[];
	failures: string[];
}

/** Runs the real GA (no mock) for a few generations from a single seed. */
async function runGA(seed: number): Promise<RunSummary> {
	const contexts: GenerationContext[] = [];
	const failures: string[] = [];
	const telemetry: GaTelemetry = {
		generationStarted: () => {},
		stagnationUpdated: () => {},
		evaluationFailed: (reason) => failures.push(reason),
	};
	const defaults = createGAControlGenome();
	const runner = new GeneticAlgorithmRunner({
		windowSets: WINDOW_SETS,
		backendFactory: makeSeededBackendFactory(seed),
		evalConcurrency: 2,
		telemetry,
		onGeneration: (ctx) => contexts.push(ctx),
		initialControl: {
			...defaults,
			population: { ...defaults.population, size: 4 as PositiveInt },
			termination: {
				...defaults.termination,
				maxGenerations: GENERATIONS as PositiveInt,
				timeBudgetMs: DurationMs.of(10 * 60 * 1_000),
			},
			seeding: { envSeed: seed, mutationSeed: seed, networkSeed: seed },
		},
	});

	const best = await runner.run();

	return {
		bestFitness: contexts.map((ctx) => ctx.bestFitness),
		populationIds: contexts.map((ctx) =>
			ctx.population.map((genome) => genome.id)
		),
		bestId: best.id,
		bestWeights: [...(best.trainedWeights ?? [])],
		failures,
	};
}

describe("GA end-to-end replay", () => {
	setLogger({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	} as never);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("should evaluate every genome for real (no evaluation failure)", async () => {
		const run = await runGA(42);

		expect(run.failures).toEqual([]);
		expect(run.bestFitness).toHaveLength(GENERATIONS);
		expect(run.bestFitness.every(Number.isFinite)).toBe(true);
		expect(run.bestWeights.length).toBeGreaterThan(0);
	});

	it("should replay the exact same best score from the same seed", async () => {
		const first = await runGA(42);
		const second = await runGA(42);

		expect(second.bestFitness).toEqual(first.bestFitness);
		expect(second.bestId).toBe(first.bestId);
		expect(second.populationIds).toEqual(first.populationIds);
		expect(second.bestWeights).toEqual(first.bestWeights);
	});

	it("should explore differently from another seed", async () => {
		const first = await runGA(42);
		const other = await runGA(43);

		expect(other.bestWeights).not.toEqual(first.bestWeights);
	});

	it("should not draw from Math.random anywhere in the run", async () => {
		const spy = jest.spyOn(Math, "random");

		await runGA(42);

		expect(spy).not.toHaveBeenCalled();
	});
});
