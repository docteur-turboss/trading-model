import { describe, expect, test } from "@jest/globals";
import {
	validateEvalResult,
	validateGenomeInputs,
} from "../../../../src/domain/genetic-algorithm/evaluation-validation";
import {
	adaptGAControl,
	checkTerminationConditions,
	createCrossoverGenome,
	createGAControlGenome,
	type GAControlGenome,
} from "../../../../src/domain/genetic-algorithm/genome-control";
import {
	buildParetoFronts,
	sortPopulation,
} from "../../../../src/domain/genetic-algorithm/pareto-processor";

const anyArgs = (value: unknown) => value as never;

function ctrlWith(
	size: number,
	elitism: number,
	survivors: number,
	episodes: number
): GAControlGenome {
	return {
		...createGAControlGenome(),
		population: {
			size,
			elitismFraction: elitism,
			survivorFraction: survivors,
		},
		evaluation: { episodesPerIndividual: episodes },
	} as GAControlGenome;
}

describe("pareto-processor", () => {
	test("buildParetoFronts averages fitness and efficiency and keeps order", () => {
		const metas = [{ efficiencyScore: 1 }, { efficiencyScore: 3 }] as never[];
		const genomes = [{ id: "a" }, { id: "b" }] as never[];
		const objs = [
			{ avgPnl: 2, sharpe: 2, negFlops: -1 },
			{ avgPnl: 1, sharpe: 1, negFlops: -2 },
		];
		const res = buildParetoFronts(genomes, objs, metas, () => 0.5);
		expect(res.avgFit).toBe(2);
		expect(res.popWithMeta.map((m) => m.genome)).toEqual(genomes);
		expect(res.popWithMeta.map((m) => m.fitness)).toEqual([1, 3]);
		expect(res.popWithMeta[1].fitnessMeta).toBe(metas[1]);
		expect(res.popMeta.paretoRank).toEqual([0, 1]);
	});

	test("sortPopulation orders by rank, then by larger crowding distance", () => {
		const pop = ["a", "b", "c", "d"].map((id) => ({ id })) as never[];
		const meta = {
			objectives: [],
			paretoRank: [1, 0, 0, 1],
			crowdingDist: [5, 1, 2, 9],
		};
		const sorted = sortPopulation(pop, meta) as unknown as { id: string }[];
		expect(sorted.map((m) => m.id)).toEqual(["c", "b", "d", "a"]);
	});
});

describe("genome-control", () => {
	test("default genomes carry exact values", () => {
		expect(createCrossoverGenome()).toEqual({ probability: 0.7 });
		expect(createGAControlGenome()).toMatchObject({
			population: { size: 20, elitismFraction: 0.1, survivorFraction: 0.5 },
			termination: {
				stagnationPatience: 15,
				maxGenerations: 100,
				timeBudgetMs: 300_000,
			},
			seeding: { envSeed: 42, mutationSeed: 1337, networkSeed: 7 },
			evaluation: { episodesPerIndividual: 10 },
			mutationRate: 0.1,
			mutationStd: 0.05,
		});
	});

	test("adaptGAControl needs 3 points of history", () => {
		const ctrl = ctrlWith(20, 0.1, 0.5, 10);
		expect(adaptGAControl(ctrl, [1, 2], 20)).toBe(ctrl);
	});

	test("stagnation grows population, elitism, survivors and episodes", () => {
		const out = adaptGAControl(ctrlWith(20, 0.1, 0.5, 10), [3, 2, 1], 11);
		expect(out.population.size).toBe(22);
		expect(out.population.elitismFraction).toBeCloseTo(0.12);
		expect(out.population.survivorFraction).toBeCloseTo(0.55);
		expect(out.evaluation.episodesPerIndividual).toBe(11);
	});

	test("stagnation thresholds are strict", () => {
		const out = adaptGAControl(ctrlWith(20, 0.1, 0.5, 10), [3, 2, 1], 5);
		expect(out.population.size).toBe(20);
		expect(out.population.elitismFraction).toBe(0.1);
		expect(out.population.survivorFraction).toBe(0.5);
		expect(out.evaluation.episodesPerIndividual).toBe(10);
		const six = adaptGAControl(ctrlWith(20, 0.1, 0.5, 10), [3, 2, 1], 7);
		expect(six.evaluation.episodesPerIndividual).toBe(11);
		const eight = adaptGAControl(ctrlWith(20, 0.1, 0.5, 10), [3, 2, 1], 9);
		expect(eight.population.elitismFraction).toBeCloseTo(0.12);
	});

	test("stagnation growth is capped", () => {
		const out = adaptGAControl(ctrlWith(80, 0.3, 0.9, 30), [3, 2, 1], 20);
		expect(out.population.size).toBe(80);
		expect(out.population.elitismFraction).toBe(0.3);
		expect(out.population.survivorFraction).toBe(0.9);
		expect(out.evaluation.episodesPerIndividual).toBe(30);
		const near = adaptGAControl(ctrlWith(79, 0.29, 0.88, 29), [3, 2, 1], 20);
		expect(near.population.size).toBe(80);
		expect(near.population.elitismFraction).toBeCloseTo(0.3);
		expect(near.population.survivorFraction).toBeCloseTo(0.9);
		expect(near.evaluation.episodesPerIndividual).toBe(30);
	});

	test("improvement shrinks population, elitism and episodes within floors", () => {
		const out = adaptGAControl(ctrlWith(20, 0.1, 0.5, 20), [1, 2, 3], 0);
		expect(out.population.size).toBe(19);
		expect(out.population.elitismFraction).toBeCloseTo(0.09);
		expect(out.population.survivorFraction).toBe(0.5);
		expect(out.evaluation.episodesPerIndividual).toBe(19);
		const floor = adaptGAControl(ctrlWith(8, 0.05, 0.5, 10), [1, 2, 3], 0);
		expect(floor.population.size).toBe(8);
		expect(floor.population.elitismFraction).toBe(0.05);
		expect(floor.evaluation.episodesPerIndividual).toBe(10);
		const above = adaptGAControl(ctrlWith(9, 0.06, 0.5, 11), [1, 2, 3], 0);
		expect(above.population.size).toBe(8);
		expect(above.population.elitismFraction).toBeCloseTo(0.05);
		expect(above.evaluation.episodesPerIndividual).toBe(10);
	});

	test("no change on flat history without stagnation", () => {
		const out = adaptGAControl(ctrlWith(20, 0.1, 0.5, 20), [2, 2, 2], 0);
		expect(out.population.size).toBe(20);
		expect(out.evaluation.episodesPerIndividual).toBe(20);
	});

	test("improvement only looks at the last 5 points", () => {
		const out = adaptGAControl(
			ctrlWith(20, 0.1, 0.5, 20),
			[0, 9, 5, 4, 3, 2, 1],
			0
		);
		expect(out.population.size).toBe(20);
	});

	test("checkTerminationConditions reports each reason at its boundary", () => {
		const ctrl = {
			...createGAControlGenome(),
			termination: {
				rewardThreshold: 10,
				stagnationPatience: 3,
				maxGenerations: 5,
				timeBudgetMs: 1000,
			},
		} as GAControlGenome;
		const base = {
			generation: 0,
			bestFitness: 0,
			stagnation: 0,
			elapsedMs: 0,
			ctrl,
		};
		expect(checkTerminationConditions(base)).toEqual({ shouldStop: false });
		expect(checkTerminationConditions({ ...base, bestFitness: 10 })).toEqual({
			shouldStop: true,
			reason: "Reward threshold reached",
		});
		expect(checkTerminationConditions({ ...base, stagnation: 3 })).toEqual({
			shouldStop: true,
			reason: "Stagnation patience exceeded",
		});
		expect(checkTerminationConditions({ ...base, generation: 5 })).toEqual({
			shouldStop: true,
			reason: "Max generations reached",
		});
		expect(checkTerminationConditions({ ...base, elapsedMs: 1000 })).toEqual({
			shouldStop: true,
			reason: "Time budget exceeded",
		});
		expect(
			checkTerminationConditions({
				...base,
				bestFitness: 9,
				stagnation: 2,
				generation: 4,
				elapsedMs: 999,
			})
		).toEqual({ shouldStop: false });
	});
});

describe("evaluation-validation", () => {
	const genome = (over: Record<string, unknown> = {}) =>
		anyArgs({
			network: { inputDim: 1, outputDim: 1 },
			rl: { rewardShaping: { clipBounds: { lo: -1, hi: 1 } } },
			...over,
		});
	const windows = (train = 1, validation = 1) =>
		anyArgs({ train: new Array(train), validation: new Array(validation) });

	test("accepts valid inputs", () => {
		expect(() => validateGenomeInputs(genome(), windows())).not.toThrow();
	});

	test.each([
		[
			"inputDim",
			{ network: { inputDim: 0, outputDim: 1 } },
			"inputDim must be positive",
		],
		[
			"outputDim",
			{ network: { inputDim: 1, outputDim: 0 } },
			"outputDim must be positive",
		],
		[
			"lo",
			{ rl: { rewardShaping: { clipBounds: { lo: "x", hi: 1 } } } },
			"rewardShaping.clipBounds must have numeric lo/hi",
		],
		[
			"hi",
			{ rl: { rewardShaping: { clipBounds: { lo: 1, hi: "x" } } } },
			"rewardShaping.clipBounds must have numeric lo/hi",
		],
	])("rejects bad genome (%s)", (_name, over, msg) => {
		expect(() => validateGenomeInputs(genome(over), windows())).toThrow(
			`[Invariant] ${msg}`
		);
	});

	test("rejects empty windows", () => {
		expect(() => validateGenomeInputs(genome(), windows(0, 1))).toThrow(
			"[Invariant] windowSet.train must not be empty"
		);
		expect(() => validateGenomeInputs(genome(), windows(1, 0))).toThrow(
			"[Invariant] windowSet.validation must not be empty"
		);
	});

	test("validateEvalResult rejects non-finite values with the value", () => {
		expect(() =>
			validateEvalResult(anyArgs({ episodePnl: [1, 2], pnlCurve: [0] }))
		).not.toThrow();
		expect(() =>
			validateEvalResult(anyArgs({ episodePnl: [1, Number.NaN], pnlCurve: [] }))
		).toThrow("[Invariant] episode PnL must be finite, got NaN");
		expect(() =>
			validateEvalResult(
				anyArgs({ episodePnl: [], pnlCurve: [Number.POSITIVE_INFINITY] })
			)
		).toThrow("[Invariant] bar PnL must be finite, got Infinity");
	});
});
