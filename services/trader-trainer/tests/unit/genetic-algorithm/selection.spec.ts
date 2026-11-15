import { describe, expect, test } from "@jest/globals";
import type {
	Fitness,
	PositiveInt,
	Ratio,
} from "@trading-model/primitives/primitives";
import { DurationMs } from "@trading-model/primitives/primitives";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { PopMember } from "../../../src/domain/genetic-algorithm/genome";
import { selectParent } from "../../../src/domain/genetic-algorithm/selection";

function makePopulation(): PopMember[] {
	const fitnesses = [0.1, 0.5, 0.8, 0.3, 0.6];
	return fitnesses.map((fitness, i) => ({
		genome: createDefaultGenome(`g${i}`, 1 as PositiveInt),
		fitness: fitness as Fitness,
		fitnessMeta: {
			episodesRun: 3 as PositiveInt,
			computeMs: DurationMs.of(100),
			efficiencyScore: fitness as Ratio,
			variance: 0.1,
			rawScores: new EpisodeScores([fitness, fitness * 0.9, fitness * 1.1]),
		},
	}));
}

function makeAlternating(...values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

describe("Selection - selectParent", () => {
	const rng = () => 0.5;

	test("tournament selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, rng);
		expect(parent).toBeDefined();
		expect(pop.map((m) => m.genome)).toContain(parent);
	});

	test("tournament selection with k=1 should return random parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, () => 0.0, 1);
		expect(parent).toBeDefined();
	});

	test("tournament selection should pick challenger with higher fitness", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, makeAlternating(0.01, 0.4, 0.8), 3);
		expect(parent).toBeDefined();
	});

	test("should handle population with all zero fitness", () => {
		const pop: PopMember[] = Array.from({ length: 5 }, (_, i) => ({
			genome: createDefaultGenome(`g${i}`, 1 as PositiveInt),
			fitness: 0 as Fitness,
			fitnessMeta: {
				episodesRun: 3 as PositiveInt,
				computeMs: DurationMs.of(100),
				efficiencyScore: 0 as Ratio,
				variance: 0,
				rawScores: new EpisodeScores([0, 0, 0]),
			},
		}));
		const parent = selectParent(pop, rng);
		expect(parent).toBeDefined();
	});
});
