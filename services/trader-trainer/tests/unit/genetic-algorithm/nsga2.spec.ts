import { describe, expect, test } from "@jest/globals";
import { buildPopulationMeta } from "../../../src/core/genetic-algorithm/nsga2";

function linearRng(): () => number {
	let s = 0.1;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
}

describe("buildPopulationMeta", () => {
	test("should return all rank 0 for single element", () => {
		const rng = linearRng();
		const meta = buildPopulationMeta(
			[{ avgPnl: 10, sharpe: 1, negFlops: -100 }],
			rng
		);
		expect(meta.paretoRank).toEqual([0]);
		expect(meta.crowdingDist[0]).toBe(Number.POSITIVE_INFINITY);
	});

	test("should correctly rank dominated objectives", () => {
		const rng = linearRng();
		const objs = [
			{ avgPnl: 100, sharpe: 2, negFlops: -50 },
			{ avgPnl: 50, sharpe: 1, negFlops: -100 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank[0]).toBe(0);
		expect(meta.paretoRank[1]).toBe(1);
	});

	test("should assign same rank to non-dominated solutions", () => {
		const rng = linearRng();
		const objs = [
			{ avgPnl: 100, sharpe: 1, negFlops: -100 },
			{ avgPnl: 50, sharpe: 2, negFlops: -200 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank[0]).toBe(0);
		expect(meta.paretoRank[1]).toBe(0);
	});

	test("should compute finite crowding distance for interior points", () => {
		const rng = linearRng();
		const objs = [
			{ avgPnl: 10, sharpe: 1, negFlops: -100 },
			{ avgPnl: 20, sharpe: 2, negFlops: -200 },
			{ avgPnl: 30, sharpe: 3, negFlops: -300 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank).toEqual([0, 0, 0]);
		expect(meta.crowdingDist[0]).toBe(Number.POSITIVE_INFINITY);
		expect(meta.crowdingDist[2]).toBe(Number.POSITIVE_INFINITY);
		expect(meta.crowdingDist[1]).toBeGreaterThan(0);
	});

	test("should handle identical objectives as rank 0", () => {
		const rng = linearRng();
		const objs = [
			{ avgPnl: 50, sharpe: 1, negFlops: -100 },
			{ avgPnl: 50, sharpe: 1, negFlops: -100 },
			{ avgPnl: 50, sharpe: 1, negFlops: -100 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank).toEqual([0, 0, 0]);
	});

	test("should handle empty objectives array", () => {
		const rng = linearRng();
		const meta = buildPopulationMeta([], rng);
		expect(meta.paretoRank).toEqual([]);
		expect(meta.crowdingDist).toEqual([]);
	});

	test("should handle mixed dominance with 5 objectives", () => {
		const rng = linearRng();
		const objs = [
			{ avgPnl: 100, sharpe: 5, negFlops: -50 },
			{ avgPnl: 90, sharpe: 4, negFlops: -60 },
			{ avgPnl: 80, sharpe: 3, negFlops: -70 },
			{ avgPnl: 10, sharpe: 1, negFlops: -500 },
			{ avgPnl: 95, sharpe: 2, negFlops: -55 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank[0]).toBe(0);
		expect(meta.paretoRank[3]).toBeGreaterThanOrEqual(1);
	});

	test("should handle many objectives (triggers approximate sort)", () => {
		const rng = linearRng();
		const objs = Array.from({ length: 350 }, (_, _i) => ({
			avgPnl: Math.random() * 100,
			sharpe: Math.random() * 5,
			negFlops: -Math.random() * 1000,
		}));
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank).toHaveLength(350);
		expect(meta.crowdingDist).toHaveLength(350);
	});
});
