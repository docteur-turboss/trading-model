import { describe, expect, it, jest } from "@jest/globals";
import {
	crossoverGenomes,
	crossoverScalar,
} from "../../../src/core/genetic-algorithm/crossover";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import type {
	CrossoverGenome,
	LamarckGenome,
} from "../../../src/core/genetic-algorithm/genome-types";

describe("GA Regression — Crossover", () => {
	describe("crossoverScalar", () => {
		it("arithmetic crossover with known alpha produces deterministic blend", () => {
			const co: CrossoverGenome = {
				type: "arithmetic",
				probability: 0.5,
				blendAlpha: 0.3,
				sbxEta: 0,
			};
			const rng = jest.fn<() => number>();
			const result = crossoverScalar(10, 20, co, rng);
			expect(result).toBe(10 + (20 - 10) * 0.3);
			expect(result).toBe(13);
			expect(rng).not.toHaveBeenCalled();
		});

		it("uniform crossover picks parent based on rng threshold", () => {
			const co: CrossoverGenome = {
				type: "uniform",
				probability: 0.5,
				blendAlpha: 0,
				sbxEta: 0,
			};
			const rng = jest.fn<() => number>();
			rng.mockReturnValueOnce(0.2);
			expect(crossoverScalar(5, 15, co, rng)).toBe(5);
			rng.mockReturnValueOnce(0.7);
			expect(crossoverScalar(5, 15, co, rng)).toBe(15);
		});

		it("blend crossover output is bounded within expected range", () => {
			const co: CrossoverGenome = {
				type: "blend",
				probability: 0.5,
				blendAlpha: 0.5,
				sbxEta: 0,
			};
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(0.5);
			const result = crossoverScalar(10, 20, co, rng);
			const d = 20 - 10;
			const expectedLo = 10 - 0.5 * d;
			const expectedHi = 20 + 2 * 0.5 * d;
			expect(result).toBeGreaterThanOrEqual(expectedLo);
			expect(result).toBeLessThanOrEqual(expectedHi);
		});

		it("sbx crossover produces symmetric offspring for symmetric parents", () => {
			const co: CrossoverGenome = {
				type: "sbx",
				probability: 0.5,
				blendAlpha: 0,
				sbxEta: 2,
			};
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(0.5);
			const result = crossoverScalar(10, 10, co, rng);
			expect(result).toBe(10);
		});
	});

	describe("crossoverGenomes", () => {
		it("offspring preserves parent A structure when crossover is skipped", () => {
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(1);
			const parentA = createDefaultGenome("parent-a", 3) as LamarckGenome;
			const parentB = createDefaultGenome("parent-b", 3) as LamarckGenome;
			const child = crossoverGenomes(parentA, parentB, rng);
			expect(child.id).toBe(parentA.id);
			expect(child.network.inputDim).toBe(parentA.network.inputDim);
			expect(child.network.outputDim).toBe(parentA.network.outputDim);
			expect(child.rl.gamma).toBe(parentA.rl.gamma);
		});

		it("produces valid genome after crossover with deterministic RNG", () => {
			const rng = jest.fn<() => number>();
			rng.mockReturnValue(0);
			const parentA = createDefaultGenome("parent-a", 3) as LamarckGenome;
			const parentB = createDefaultGenome("parent-b", 3) as LamarckGenome;
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
			const parent = createDefaultGenome("parent", 3) as LamarckGenome;
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
