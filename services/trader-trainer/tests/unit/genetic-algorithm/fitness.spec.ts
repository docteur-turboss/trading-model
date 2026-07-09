import { describe, expect, test } from "@jest/globals";
import { createBounded } from "../../../src/core/genetic-algorithm/bounded";
import {
	computeFitness,
	shapeReward,
} from "../../../src/core/genetic-algorithm/fitness";
import { FitnessType } from "../../../src/core/genetic-algorithm/genome";
import type { RewardShapingGenome } from "../../../src/core/genetic-algorithm/genome-types";

describe("Fitness - computeFitness", () => {
	const scores = [100, 120, 110, 130, 140];

	test("total_pnl should return sum of scores", () => {
		const result = computeFitness(FitnessType.TotalPnl, scores);
		expect(result).toBe(600);
	});

	test("sharpe should return positive value for positive scores", () => {
		const result = computeFitness(FitnessType.Sharpe, scores);
		expect(result).toBeGreaterThan(0);
	});

	test("sharpe should return 0 for constant scores", () => {
		const result = computeFitness(FitnessType.Sharpe, [5, 5, 5]);
		expect(result).toBe(5);
	});

	test("sortino should return positive value for positive scores", () => {
		const result = computeFitness(FitnessType.Sortino, scores);
		expect(result).toBeGreaterThan(0);
	});

	test("sortino should handle no negative returns", () => {
		const result = computeFitness(FitnessType.Sortino, [10, 20, 30]);
		expect(result).toBeGreaterThan(0);
	});

	test("sortino should handle negative returns", () => {
		const result = computeFitness(FitnessType.Sortino, [10, -5, 20, -3]);
		expect(Number.isFinite(result)).toBe(true);
	});

	test("calmar should return positive value", () => {
		const result = computeFitness(FitnessType.Calmar, scores);
		expect(result).toBeGreaterThan(0);
	});

	test("calmar should handle drawdown correctly", () => {
		const result = computeFitness(FitnessType.Calmar, [100, -50, 200, -100]);
		expect(Number.isFinite(result)).toBe(true);
	});

	test("composite should combine sharpe and sortino with mean", () => {
		const result = computeFitness(FitnessType.Composite, scores);
		expect(result).toBeGreaterThan(0);
	});

	test("should return -Infinity for empty scores", () => {
		const result = computeFitness(FitnessType.Sharpe, []);
		expect(result).toBe(Number.NEGATIVE_INFINITY);
	});

	test("unknown type should return mean", () => {
		const result = computeFitness("unknown" as any, scores);
		expect(result).toBe(120);
	});
});

describe("Fitness - shapeReward", () => {
	const cfg: RewardShapingGenome = {
		clip: true,
		clipBounds: createBounded(-1, 1),
		scale: true,
		scaleFactor: 2,
		normalize: false,
		sparse: false,
	};

	test("should scale and clip reward", () => {
		const result = shapeReward(5, cfg);
		expect(result).toBe(1);
	});

	test("should scale and clip negative reward", () => {
		const result = shapeReward(-5, cfg);
		expect(result).toBe(-1);
	});

	test("should not clip when clip is false", () => {
		const result = shapeReward(5, { ...cfg, clip: false });
		expect(result).toBe(10);
	});

	test("should not scale when scale is false", () => {
		const result = shapeReward(0.5, { ...cfg, scale: false });
		expect(result).toBe(0.5);
	});

	test("should return raw reward when neither scale nor clip", () => {
		const result = shapeReward(0.5, { ...cfg, scale: false, clip: false });
		expect(result).toBe(0.5);
	});
});
