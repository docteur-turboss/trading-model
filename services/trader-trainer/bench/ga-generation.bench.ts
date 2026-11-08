/**
 * GA generation benchmark (issue #647). Not a Jest test, not run in CI: wall time
 * depends on the machine. Run from the repo root:
 *
 *   bun services/trader-trainer/bench/ga-generation.bench.ts > ga-bench.json
 *
 * Env (all optional): BENCH_GENERATIONS (10), BENCH_POPULATION (20),
 * BENCH_EPISODES (1), BENCH_STEPS (500 bars per window), BENCH_SEED (0).
 * Data and PRNG seeds are fixed, so the same settings give the same generation
 * count and fitness; only the times and heap vary. JSON on stdout, progress on stderr.
 */
import { makePRNG } from "@trading-model/crypto/domain/services/prng";
import { Price } from "@trading-model/primitives/primitives";
import { runInProcess } from "../src/application/training-session";
import { FeatureVector } from "../src/domain/feature-vector";
import { FEATURE_DIM } from "../src/domain/feature-vector-codec";
import type { WindowSet } from "../src/domain/genetic-algorithm/ga-runner";
import { NoopGaTelemetry } from "../src/domain/genetic-algorithm/ga-telemetry";
import { FitnessType } from "../src/domain/genetic-algorithm/genome-control";

function intEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === "") {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
	}
	return value;
}

const generations = intEnv("BENCH_GENERATIONS", 10);
const populationSize = intEnv("BENCH_POPULATION", 20);
const episodesPerIndividual = intEnv("BENCH_EPISODES", 1);
const steps = intEnv("BENCH_STEPS", 500);
const seedOffset = intEnv("BENCH_SEED", 0);

/** Random walk with random features, from a fixed seed. */
function syntheticSteps(length: number, seed: number) {
	const rng = makePRNG(seed);
	let price = 1000;
	return Array.from({ length }, () => {
		const features = new Float32Array(FEATURE_DIM);
		for (let i = 0; i < FEATURE_DIM; i++) {
			features[i] = rng() * 2 - 1;
		}
		price += (rng() - 0.5) * 4;
		return {
			features: FeatureVector.fromFloat32Array(features),
			price: Price.of(Math.max(1, price)),
		};
	});
}

const windowSets: WindowSet[] = [1, 2].map((win) => ({
	id: `bench-${win}`,
	train: syntheticSteps(steps, 100 + win),
	validation: syntheticSteps(Math.max(1, Math.floor(steps / 4)), 200 + win),
}));

const starts: { generation: number; at: number; heapUsed: number }[] = [];
const telemetry = {
	...NoopGaTelemetry,
	generationStarted: (generation: number) =>
		starts.push({
			generation,
			at: performance.now(),
			heapUsed: process.memoryUsage().heapUsed,
		}),
};

const t0 = performance.now();
const result = await runInProcess(
	windowSets,
	{
		validationSplit: 0.2,
		walkForwardFolds: 1,
		generations,
		populationSize,
		// Large: the generation count, not the time budget, ends the run.
		timeBudgetMs: 24 * 3_600_000,
		episodesPerIndividual,
		fitnessType: FitnessType.TotalPnl,
		seedOffset,
	},
	telemetry
);
const end = performance.now();

const msPerGeneration = starts.map((step, idx) =>
	Math.round((idx + 1 < starts.length ? starts[idx + 1].at : end) - step.at)
);
const mem = process.memoryUsage();
const sorted = [...msPerGeneration].sort((lhs, rhs) => lhs - rhs);

console.log(
	JSON.stringify(
		{
			schema: 1,
			config: {
				generations,
				populationSize,
				episodesPerIndividual,
				steps,
				seedOffset,
			},
			env: {
				runtime: `bun ${Bun.version}`,
				platform: process.platform,
				arch: process.arch,
			},
			generationsRun: result.generation,
			bestFitness: result.bestFitness,
			totalMs: Math.round(end - t0),
			msPerGeneration,
			medianMsPerGeneration: sorted[Math.floor(sorted.length / 2)] ?? 0,
			heapUsedStartBytes: starts[0]?.heapUsed ?? 0,
			heapUsedEndBytes: mem.heapUsed,
			heapUsedPeakSampleBytes: Math.max(
				...starts.map((step) => step.heapUsed),
				0
			),
			rssEndBytes: mem.rss,
		},
		null,
		2
	)
);
