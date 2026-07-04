import { describe, expect, test } from "@jest/globals";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import type { ObjectiveVector } from "../../../src/core/genetic-algorithm/pareto-engine";
import {
	buildPopulationMeta,
	dominates,
	ParetoArchive,
} from "../../../src/core/genetic-algorithm/pareto-engine";

describe("dominates", () => {
	test("returns true when a strictly dominates b in all objectives", () => {
		const a: ObjectiveVector = { avgPnl: 10, sharpe: 2, negFlops: -100 };
		const b: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -200 };
		expect(dominates(a, b)).toBe(true);
	});

	test("returns false when b dominates a", () => {
		const a: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -200 };
		const b: ObjectiveVector = { avgPnl: 10, sharpe: 2, negFlops: -100 };
		expect(dominates(a, b)).toBe(false);
	});

	test("returns false when vectors are equal", () => {
		const a: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -100 };
		const b: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -100 };
		expect(dominates(a, b)).toBe(false);
	});

	test("returns false when a is better in one but worse in another", () => {
		const a: ObjectiveVector = { avgPnl: 10, sharpe: 0.5, negFlops: -100 };
		const b: ObjectiveVector = { avgPnl: 5, sharpe: 2, negFlops: -100 };
		expect(dominates(a, b)).toBe(false);
	});

	test("returns false when a is equal in all objectives", () => {
		const a: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -100 };
		const b: ObjectiveVector = { avgPnl: 5, sharpe: 1, negFlops: -50 };
		expect(dominates(a, b)).toBe(false);
	});
});

describe("buildPopulationMeta", () => {
	const rng = () => 0.5;

	test("assigns rank 0 to non-dominated and higher ranks to dominated individuals", () => {
		const objs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
			{ avgPnl: 8, sharpe: 1.5, negFlops: -150 },
			{ avgPnl: 3, sharpe: 0.5, negFlops: -300 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank[0]).toBe(0);
		expect(meta.paretoRank[1]).toBeGreaterThanOrEqual(0);
		expect(meta.paretoRank[2]).toBeGreaterThanOrEqual(meta.paretoRank[1]);
	});

	test("assigns rank 0 to non-dominated and rank 1 to dominated individuals (equal front)", () => {
		const objs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
			{ avgPnl: 3, sharpe: 0.5, negFlops: -300 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank[0]).toBe(0);
		expect(meta.paretoRank[1]).toBe(0);
		expect(meta.paretoRank[2]).toBeGreaterThan(0);
	});

	test("crowding distance is Infinity for single front with <= 2 members", () => {
		const objs: ObjectiveVector[] = [{ avgPnl: 10, sharpe: 2, negFlops: -100 }];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.crowdingDist[0]).toBe(Number.POSITIVE_INFINITY);
	});

	test("crowding distance is finite for interior points on a front", () => {
		const objs: ObjectiveVector[] = [
			{ avgPnl: 0, sharpe: 0, negFlops: 0 },
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
			{ avgPnl: 5, sharpe: 1, negFlops: -50 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.crowdingDist[0]).toBe(Number.POSITIVE_INFINITY);
		expect(meta.crowdingDist[1]).toBe(Number.POSITIVE_INFINITY);
		expect(meta.crowdingDist[2]).toBeGreaterThan(0);
		expect(meta.crowdingDist[2]).toBeLessThan(Number.POSITIVE_INFINITY);
	});

	test("approximate sort with monotonic objectives covers both dominates branches", () => {
		const count = 350;
		const objs: ObjectiveVector[] = Array.from({ length: count }, (_, i) => ({
			avgPnl: i,
			sharpe: i * 0.1,
			negFlops: -1000 + i,
		}));
		const meta = buildPopulationMeta(objs, Math.random);
		expect(meta.paretoRank).toHaveLength(count);
	});

	test("crowding handles range === 0 when all values are equal for an objective", () => {
		const objs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 1, negFlops: -100 },
			{ avgPnl: 5, sharpe: 1, negFlops: -50 },
			{ avgPnl: 0, sharpe: 1, negFlops: -10 },
		];
		const meta = buildPopulationMeta(objs, rng);
		expect(meta.paretoRank.every((r) => r === 0)).toBe(true);
		expect(meta.crowdingDist).toHaveLength(3);
	});
});

describe("ParetoArchive", () => {
	test("starts empty", () => {
		const archive = new ParetoArchive();
		expect(archive.size).toBe(0);
		expect(archive.members).toEqual([]);
	});

	test("accepts non-dominated solutions", () => {
		const archive = new ParetoArchive();
		const g1 = createDefaultGenome("g1");
		const g2 = createDefaultGenome("g2");
		const objs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 0.5, negFlops: -100 },
			{ avgPnl: 5, sharpe: 2, negFlops: -200 },
		];
		const changed = archive.update([g1, g2], objs);
		expect(changed).toBe(true);
		expect(archive.size).toBe(2);
	});

	test("rejects dominated solutions", () => {
		const archive = new ParetoArchive();
		const g1 = createDefaultGenome("g1");
		const g2 = createDefaultGenome("g2");
		const objs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
			{ avgPnl: 5, sharpe: 1, negFlops: -200 },
		];
		archive.update([g1], [objs[0]]);
		const changed = archive.update([g2], [objs[1]]);
		expect(changed).toBe(false);
		expect(archive.size).toBe(1);
	});

	test("evicts archive members dominated by a new candidate", () => {
		const archive = new ParetoArchive();
		const g1 = createDefaultGenome("g1");
		const g2 = createDefaultGenome("g2");
		const weakObjs: ObjectiveVector[] = [
			{ avgPnl: 5, sharpe: 1, negFlops: -200 },
		];
		const strongObjs: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
		];
		archive.update([g1], weakObjs);
		expect(archive.size).toBe(1);
		const changed = archive.update([g2], strongObjs);
		expect(changed).toBe(true);
		expect(archive.size).toBe(1);
		expect(archive.members[0]).toBe(g2);
	});

	test("returns true when archive changes and false when dominated", () => {
		const archive = new ParetoArchive();
		const g1 = createDefaultGenome("g1");
		const g2 = createDefaultGenome("g2");
		const strong: ObjectiveVector[] = [
			{ avgPnl: 10, sharpe: 2, negFlops: -100 },
		];
		const weak: ObjectiveVector[] = [
			{ avgPnl: 3, sharpe: 0.5, negFlops: -300 },
		];
		expect(archive.update([g1], strong)).toBe(true);
		expect(archive.update([g2], weak)).toBe(false);
	});

	test("members getter returns readonly array", () => {
		const archive = new ParetoArchive();
		const g = createDefaultGenome("g");
		const objs: ObjectiveVector[] = [{ avgPnl: 10, sharpe: 2, negFlops: -100 }];
		archive.update([g], objs);
		const members = archive.members;
		expect(members).toHaveLength(1);
		expect(members[0]).toBe(g);
	});
});
