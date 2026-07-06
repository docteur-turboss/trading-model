import { describe, expect, test } from "@jest/globals";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import { SelectionType } from "../../../src/core/genetic-algorithm/genome";
import type { LamarckGenome } from "../../../src/core/genetic-algorithm/genome-types";
import { selectParent } from "../../../src/core/genetic-algorithm/selection";

function makePopulation(): LamarckGenome[] {
	const pop: LamarckGenome[] = [];
	const fitnesses = [0.1, 0.5, 0.8, 0.3, 0.6];
	for (let i = 0; i < fitnesses.length; i++) {
		const g = createDefaultGenome(`g${i}`, 1) as LamarckGenome;
		g.fitness = fitnesses[i];
		pop.push(g);
	}
	return pop;
}

function makeAlternating(...values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

describe("Selection - selectParent", () => {
	const rng = () => 0.5;

	test("tournament selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Tournament, rng);
		expect(parent).toBeDefined();
		expect(pop).toContain(parent);
	});

	test("tournament selection with k=1 should return random parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Tournament, () => 0.0, 1);
		expect(parent).toBeDefined();
	});

	test("tournament selection should pick challenger with higher fitness", () => {
		const pop = makePopulation();
		const parent = selectParent(
			pop,
			SelectionType.Tournament,
			makeAlternating(0.01, 0.4, 0.8),
			3
		);
		expect(parent).toBeDefined();
	});

	test("roulette selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Roulette, rng);
		expect(parent).toBeDefined();
		expect(pop).toContain(parent);
	});

	test("roulette selection with rng=0 returns first element", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Roulette, () => 0.0);
		expect(parent).toBe(pop[0]);
	});

	test("roulette selection with rng near total returns last element", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Roulette, () => 0.999);
		expect(parent).toBeDefined();
	});

	test("rank selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Rank, rng);
		expect(parent).toBeDefined();
		expect(pop).toContain(parent);
	});

	test("rank selection with rng=0 returns first element", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Rank, () => 0.0);
		expect(parent).toBeDefined();
	});

	test("rank selection with high rng returns highest-fitness element", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Rank, () => 1.0);
		expect(parent.fitness).toBe(0.8);
	});

	test("rank selection fallback when pick > 0 after loop", () => {
		const pop = makePopulation();
		const total = (pop.length * (pop.length + 1)) / 2;
		const rng = () => (total + Number.EPSILON) / total;
		const parent = selectParent(pop, SelectionType.Rank, rng);
		expect(parent.fitness).toBe(0.8);
	});

	test("truncation selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Truncation, rng);
		expect(parent).toBeDefined();
		expect(pop).toContain(parent);
	});

	test("sus selection should return a parent", () => {
		const pop = makePopulation();
		const parent = selectParent(pop, SelectionType.Sus, rng);
		expect(parent).toBeDefined();
		expect(pop).toContain(parent);
	});

	test("tournament selection should handle undefined fitness", () => {
		const pop: LamarckGenome[] = [];
		for (let i = 0; i < 5; i++) {
			const g = createDefaultGenome(`g${i}`, 1) as LamarckGenome;
			g.fitness = undefined;
			pop.push(g);
		}
		const parent = selectParent(pop, SelectionType.Tournament, rng);
		expect(parent).toBeDefined();
	});

	test("rank selection should handle undefined fitness", () => {
		const pop: LamarckGenome[] = [];
		for (let i = 0; i < 5; i++) {
			const g = createDefaultGenome(`g${i}`, 1) as LamarckGenome;
			g.fitness = undefined;
			pop.push(g);
		}
		const parent = selectParent(pop, SelectionType.Rank, rng);
		expect(parent).toBeDefined();
	});

	test("should handle population with all zero fitness", () => {
		const pop: LamarckGenome[] = [];
		for (let i = 0; i < 5; i++) {
			const g = createDefaultGenome(`g${i}`, 1) as LamarckGenome;
			g.fitness = 0;
			pop.push(g);
		}
		const parent = selectParent(pop, SelectionType.Roulette, rng);
		expect(parent).toBeDefined();
	});

	test("should handle population with all undefined fitness", () => {
		const pop: LamarckGenome[] = [];
		for (let i = 0; i < 5; i++) {
			const g = createDefaultGenome(`g${i}`, 1) as LamarckGenome;
			g.fitness = undefined;
			pop.push(g);
		}
		const parent = selectParent(pop, SelectionType.Roulette, rng);
		expect(parent).toBeDefined();
	});
});
