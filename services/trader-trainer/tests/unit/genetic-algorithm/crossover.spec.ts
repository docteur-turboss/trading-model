import { describe, expect, test } from "@jest/globals";
import {
	crossoverGenomes,
	crossoverScalar,
} from "../../../src/core/genetic-algorithm/crossover";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import {
	ActivationType,
	ConnectionType,
	CrossoverType,
	InitialisationType,
} from "../../../src/core/genetic-algorithm/genome";

describe("Crossover - crossoverScalar", () => {
	const rng = () => 0.5;
	const baseCo = {
		type: CrossoverType.Arithmetic,
		probability: 1,
		blendAlpha: 0.5,
		sbxEta: 2,
	};

	test("arithmetic crossover should interpolate", () => {
		const result = crossoverScalar({ left: 10, right: 20, co: baseCo, rng });
		expect(result).toBe(15);
	});

	test("blend crossover should return value within range", () => {
		const co = { ...baseCo, type: CrossoverType.Blend };
		const result = crossoverScalar({ left: 10, right: 20, co, rng });
		expect(result).toBeGreaterThanOrEqual(5);
		expect(result).toBeLessThanOrEqual(25);
	});

	test("sbx crossover should return valid value", () => {
		const co = { ...baseCo, type: CrossoverType.Sbx };
		const result = crossoverScalar({ left: 10, right: 20, co, rng });
		expect(Number.isFinite(result)).toBe(true);
	});

	test("uniform crossover should pick one of the parents", () => {
		const co = { ...baseCo, type: CrossoverType.Uniform };
		const result = crossoverScalar({ left: 10, right: 20, co, rng });
		expect([10, 20]).toContain(result);
	});

	test("uniform crossover with rng < 0.5 picks first parent", () => {
		const co = { ...baseCo, type: CrossoverType.Uniform };
		const rngLow = () => 0.3;
		const result = crossoverScalar({ left: 10, right: 20, co, rng: rngLow });
		expect(result).toBe(10);
	});

	test("uniform crossover with rng >= 0.5 picks second parent", () => {
		const co = { ...baseCo, type: CrossoverType.Uniform };
		const rngHigh = () => 0.7;
		const result = crossoverScalar({ left: 10, right: 20, co, rng: rngHigh });
		expect(result).toBe(20);
	});

	test("sbx crossover with u < 0.5 should use first beta branch", () => {
		const co = { ...baseCo, type: CrossoverType.Sbx };
		const rngLow = () => 0.3;
		const result = crossoverScalar({ left: 10, right: 20, co, rng: rngLow });
		expect(Number.isFinite(result)).toBe(true);
	});
});

describe("Crossover - crossoverGenomes", () => {
	const rng = () => 0.5;

	test("should produce offspring from two parents", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring).toBeDefined();
		expect(offspring.id).toBe("a");
	});

	test("should skip crossover when rng > probability", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, () => 0.8);
		expect(offspring.id).toBe("a");
		expect(JSON.stringify(offspring)).toBe(JSON.stringify(parentA));
	});

	test("should not mutate parents", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const aClone = JSON.stringify(parentA);
		crossoverGenomes(parentA, parentB, rng);
		expect(JSON.stringify(parentA)).toBe(aClone);
	});

	test("should handle identical parents", () => {
		const parent = createDefaultGenome("p");
		const offspring = crossoverGenomes(parent, parent, rng);
		expect(offspring).toBeDefined();
	});

	test("offspring should have valid network structure", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring.network).toBeDefined();
		expect(offspring.network.hiddenLayers.length).toBeGreaterThan(0);
		expect(offspring.rl).toBeDefined();
		expect(offspring.mutation).toBeDefined();
	});

	test("should handle parents with different hidden layer counts", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.2);
		expect(offspring.network.hiddenLayers.length).toBe(2);
	});

	test("should skip extra layer when rng >= 0.5 in crossoverNetwork", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.6);
		expect(offspring.network.hiddenLayers.length).toBe(1);
	});

	test("should use longer parent when a has fewer layers than b", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentA.network.hiddenLayers = [
			{
				neurons: 32,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.3);
		expect(offspring.network.hiddenLayers.length).toBeGreaterThanOrEqual(1);
	});

	test("should push extra layer when rng < 0.5 in crossoverNetwork", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.3);
		expect(offspring.network.hiddenLayers.length).toBe(2);
	});

	test("should crossover with arithmetic type", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentA.crossover.type = CrossoverType.Arithmetic;
		parentB.crossover.type = CrossoverType.Arithmetic;
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring).toBeDefined();
	});

	test("should crossover with blend type", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentA.crossover.type = CrossoverType.Blend;
		parentB.crossover.type = CrossoverType.Blend;
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring).toBeDefined();
	});

	test("should crossover with sbx type", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentA.crossover.type = CrossoverType.Sbx;
		parentB.crossover.type = CrossoverType.Sbx;
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring).toBeDefined();
	});
});
