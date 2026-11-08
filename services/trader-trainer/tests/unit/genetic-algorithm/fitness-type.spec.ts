import { describe, expect, it } from "@jest/globals";
import { Cash, Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { EVAL_EPSILON } from "../../../src/domain/genetic-algorithm/evaluation-phase";
import { evaluateGenomeAllWindows } from "../../../src/domain/genetic-algorithm/evaluation-pipeline";
import {
	barsPerYear,
	computeFitness,
	FAILED_FITNESS,
} from "../../../src/domain/genetic-algorithm/evaluation-utils";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import { GenerationProcessor } from "../../../src/domain/genetic-algorithm/generation-processor";
import {
	createGAControlGenome,
	FitnessType,
} from "../../../src/domain/genetic-algorithm/genome-control";
import type {
	LamarckGenome,
	MarketStep,
} from "../../../src/domain/genetic-algorithm/genome-types";
import type { RLBackend } from "../../../src/domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";

/** Bar PnL changes: the volatile strategy earns more, the steady one is smoother. */
const VOLATILE = [10, -6];
const STEADY = [1, 0.8];

function steps(count: number): MarketStep[] {
	return Array.from({ length: count }, (_unused, idx) => ({
		features: new FeatureVector(),
		price: Price.of(100 + idx),
	}));
}

/** A backend whose wallet PnL follows `deltas` cyclically, one per step. */
function scriptedBackend(deltas: number[]): RLBackend {
	let pnl = 0;
	let stepCount = 0;
	return {
		forwardPass: () => new Float32Array(3),
		step: () => {
			pnl += deltas[stepCount++ % deltas.length];
			// The training reward is not the PnL: fitness must not read it.
			return { reward: 1_000, action: 1 };
		},
		remember: () => undefined,
		replay: () => undefined,
		getWeights: () => new Float32Array(2),
		setWeights: () => undefined,
		getPnL: () => Cash.of(pnl),
		resetEpisode: () => {
			pnl = 0;
			stepCount = 0;
		},
	};
}

/** Even-indexed genomes trade the volatile way, odd ones the steady way. */
function backendFor(genome: DeepReadonly<LamarckGenome>): RLBackend {
	const index = Number(String(genome.id).split("_").pop());
	return scriptedBackend(index % 2 === 0 ? VOLATILE : STEADY);
}

function evaluation(deltas: number[]) {
	const pnlCurve = Array.from({ length: 20 }, (_u, i) => deltas[i % 2]);
	const total = pnlCurve.reduce((sum, value) => sum + value, 0);
	return { episodePnl: [total], pnlCurve };
}

describe("computeFitness", () => {
	it("ranks two strategies differently under total_pnl and sharpe", () => {
		const volatile = evaluation(VOLATILE);
		const steady = evaluation(STEADY);

		expect(computeFitness(FitnessType.TotalPnl, volatile)).toBeGreaterThan(
			computeFitness(FitnessType.TotalPnl, steady)
		);
		expect(computeFitness(FitnessType.Sharpe, steady)).toBeGreaterThan(
			computeFitness(FitnessType.Sharpe, volatile)
		);
	});

	it.each([
		[FitnessType.TotalPnl, (e: EpisodeScores) => e.mean(), "episodes"],
		[FitnessType.Sharpe, (c: EpisodeScores) => c.sharpe(), "curve"],
		[FitnessType.Sortino, (c: EpisodeScores) => c.sortino(), "curve"],
		[FitnessType.Calmar, (c: EpisodeScores) => c.calmar(), "curve"],
		[FitnessType.Composite, (c: EpisodeScores) => c.composite(), "curve"],
	])("%s reads the %s", (type, metric, source) => {
		const pnl = { episodePnl: [4, -1, 6], pnlCurve: [2, -3, 1, 4, -1, 0.5] };
		const scores = new EpisodeScores(
			source === "episodes" ? pnl.episodePnl : pnl.pnlCurve
		);

		expect(computeFitness(type, pnl)).toBeCloseTo(metric(scores));
	});

	it("scores 0 without any episode", () => {
		expect(
			computeFitness(FitnessType.Sharpe, { episodePnl: [], pnlCurve: [] })
		).toBe(0);
	});
});

describe("evaluation reads the wallet PnL, not the shaped reward", () => {
	const windowSets = [{ id: "w1", train: steps(4), validation: steps(6) }];

	it("builds the episode PnL and the bar curve from getPnL", async () => {
		const genome = {
			...createDefaultGenome("g0_0"),
			gaControl: {
				...createGAControlGenome(),
				evaluation: { episodesPerIndividual: 2, seedsPerEval: 1 },
			},
		} as DeepReadonly<LamarckGenome>;

		const result = await evaluateGenomeAllWindows(genome, windowSets, () =>
			scriptedBackend(STEADY)
		);

		expect(result.meta.rawScores.length).toBe(2);
		for (const episodePnl of result.meta.rawScores.values) {
			expect(episodePnl).toBeCloseTo(5.4);
		}
		expect(result.meta.pnlCurve?.length).toBe(12);
		expect(result.objectives.avgPnl).toBeCloseTo(5.4);
	});

	it("gives a failed evaluation a fitness below every real score", async () => {
		const result = await evaluateGenomeAllWindows(
			createDefaultGenome("g0_0") as DeepReadonly<LamarckGenome>,
			windowSets,
			() => {
				throw new Error("boom");
			}
		);

		expect(result.meta.efficiencyScore).toBe(FAILED_FITNESS);
		expect(result.objectives.sharpe).toBe(FAILED_FITNESS);
	});
});

describe("fitnessType drives the published genome (ADR-0025)", () => {
	async function runOneGeneration(fitnessType: FitnessType) {
		const processor = new GenerationProcessor({
			windowSets: [{ id: "w1", train: steps(4), validation: steps(20) }],
			backendFactory: backendFor,
		});
		const ctrl = createGAControlGenome();
		processor.initialise({
			...ctrl,
			population: { ...ctrl.population, size: 4 as never },
			fitnessType,
		});
		await processor.runGeneration();
		return processor.archiveBest;
	}

	it("publishes the volatile genome under total_pnl and the steady one under sharpe", async () => {
		const byPnl = await runOneGeneration(FitnessType.TotalPnl);
		const bySharpe = await runOneGeneration(FitnessType.Sharpe);

		expect(byPnl?.genome.id).toMatch(/_[02]$/);
		expect(bySharpe?.genome.id).toMatch(/_[13]$/);
		expect(byPnl?.meta?.efficiencyScore).not.toBe(
			bySharpe?.meta?.efficiencyScore
		);
	});

	it("keeps both trade-offs on the Pareto front whatever the fitness type", async () => {
		const processor = new GenerationProcessor({
			windowSets: [{ id: "w1", train: steps(4), validation: steps(20) }],
			backendFactory: backendFor,
		});
		const ctrl = createGAControlGenome();
		processor.initialise({
			...ctrl,
			population: { ...ctrl.population, size: 4 as never },
			fitnessType: FitnessType.Sharpe,
		});
		await processor.runGeneration();

		const ids = processor.getArchiveMembers().map((genome) => genome.id);
		expect(ids.some((id) => /_[02]$/.test(id))).toBe(true);
		expect(ids.some((id) => /_[13]$/.test(id))).toBe(true);
	});
});

describe("evaluation protocol", () => {
	it("evaluates at a fixed small epsilon, not the training schedule", async () => {
		const seen: number[] = [];
		const genome = createDefaultGenome("g0_0") as DeepReadonly<LamarckGenome>;
		expect(genome.rl.discretePolicy.epsilonStart).toBe(1);

		await evaluateGenomeAllWindows(
			genome,
			[{ id: "w1", train: steps(4), validation: steps(6) }],
			(evaluated) => {
				seen.push(evaluated.rl.discretePolicy.epsilonStart);
				return scriptedBackend(STEADY);
			}
		);

		// the training backend keeps the genome's schedule
		expect(seen[0]).toBe(1);
		expect(new Set(seen.slice(1))).toEqual(new Set([EVAL_EPSILON]));
	});

	it("derives the bars per year from the median bar spacing", () => {
		const hourly = Array.from({ length: 5 }, (_u, idx) => ({
			...steps(1)[0],
			timestamp: idx * 3_600_000 + (idx === 3 ? 60_000 : 0),
		}));

		expect(barsPerYear(hourly)).toBeCloseTo(8766);
		expect(barsPerYear(steps(5))).toBeUndefined();
	});
});
