import { describe, expect, it, jest } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { crossoverGenomes } from "../../../src/domain/genetic-algorithm/crossover/genome-crossover";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome";

describe("GA Regression — Crossover", () => {
	describe("crossoverGenomes", () => {
		it("offspring preserves parent A structure when crossover is skipped", () => {
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(1);
			const parentA = createDefaultGenome(
				"parent-a",
				3 as PositiveInt
			) as LamarckGenome;
			const parentB = createDefaultGenome(
				"parent-b",
				3 as PositiveInt
			) as LamarckGenome;
			const child = crossoverGenomes(parentA, parentB, rng);
			expect(child.id).toBe(parentA.id);
			expect(child.network.inputDim).toBe(parentA.network.inputDim);
			expect(child.network.outputDim).toBe(parentA.network.outputDim);
			expect(child.rl.gamma).toBe(parentA.rl.gamma);
		});

		it("produces valid genome after crossover with deterministic RNG", () => {
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(0);
			const parentA = createDefaultGenome(
				"parent-a",
				3 as PositiveInt
			) as LamarckGenome;
			const parentB = createDefaultGenome(
				"parent-b",
				3 as PositiveInt
			) as LamarckGenome;
			const child = crossoverGenomes(parentA, parentB, rng);
			expect(child).toBeDefined();
			expect(child.id).toBe(parentA.id);
			expect(child.network.hiddenLayers.length).toBe(
				Math.min(
					parentA.network.hiddenLayers.length,
					parentB.network.hiddenLayers.length
				)
			);
		});

		it("identical parents produce identical offspring", () => {
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(0);
			const parent = createDefaultGenome(
				"parent",
				3 as PositiveInt
			) as LamarckGenome;
			const child1 = crossoverGenomes(parent, parent, rng);
			rng.mockClear();
			rng.mockReturnValue(0);
			const child2 = crossoverGenomes(parent, parent, rng);
			expect(child1.network.hiddenLayers.length).toBe(
				child2.network.hiddenLayers.length
			);
			for (let i = 0; i < child1.network.hiddenLayers.length; i++) {
				expect(child1.network.hiddenLayers[i].neurons).toBe(
					child2.network.hiddenLayers[i].neurons
				);
			}
		});
	});
});
