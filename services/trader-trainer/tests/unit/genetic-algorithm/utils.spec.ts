import { describe, expect, test } from "@jest/globals";
import { EpisodeScores } from "../../../src/core/genetic-algorithm/episode-scores";
import { clamp, generateId } from "../../../src/core/genetic-algorithm/utils";
import { NormalizationStats } from "../../../src/core/normalization-stats";

describe("Utils - clamp", () => {
	test("should clamp value within range", () => {
		expect(clamp(5, 0, 10)).toBe(5);
	});

	test("should clamp below min", () => {
		expect(clamp(-5, 0, 10)).toBe(0);
	});

	test("should clamp above max", () => {
		expect(clamp(15, 0, 10)).toBe(10);
	});

	test("should handle edge values", () => {
		expect(clamp(0, 0, 10)).toBe(0);
		expect(clamp(10, 0, 10)).toBe(10);
	});
});

describe("Utils - generateId", () => {
	test("should return a non-empty string", () => {
		const id = generateId();
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
	});

	test("should return different ids on successive calls", () => {
		const id1 = generateId();
		const id2 = generateId();
		expect(id1).not.toBe(id2);
	});
});

describe("Utils - NormalizationStats", () => {
	test("should have default std of 0 and mu of 0", () => {
		const stats = new NormalizationStats();
		expect(stats.std).toBe(0);
		expect(stats.mu).toBe(0);
	});

	test("should compute mean and std correctly", () => {
		const stats = new NormalizationStats();
		stats.update(1);
		stats.update(2);
		stats.update(3);

		expect(stats.mu).toBe(2);
		expect(stats.std).toBeGreaterThan(0);
	});

	test("should normalize values", () => {
		const stats = new NormalizationStats();
		stats.update(0);
		stats.update(10);

		const normalized = stats.normalize(5);
		expect(Number.isFinite(normalized)).toBe(true);
	});

	test("should handle single value normalization", () => {
		const stats = new NormalizationStats();
		stats.update(5);

		const normalized = stats.normalize(10);
		expect(Number.isFinite(normalized)).toBe(true);
	});
});

describe("EpisodeScores - variance", () => {
	test("should return 0 for fewer than 2 elements", () => {
		expect(new EpisodeScores([1]).variance()).toBe(0);
		expect(new EpisodeScores([]).variance()).toBe(0);
	});

	test("should compute variance correctly", () => {
		const scores = new EpisodeScores([1, 2, 3, 4, 5]);
		expect(scores.variance()).toBe(2.5);
	});

	test("should return 0 for constant array", () => {
		const scores = new EpisodeScores([5, 5, 5]);
		expect(scores.variance()).toBe(0);
	});
});

describe("EpisodeScores - sharpe", () => {
	test("should return 0 for fewer than 2 elements", () => {
		expect(new EpisodeScores([1]).sharpe()).toBe(0);
		expect(new EpisodeScores([]).sharpe()).toBe(0);
	});

	test("should return mean for zero standard deviation", () => {
		const scores = new EpisodeScores([5, 5, 5]);
		expect(scores.sharpe()).toBe(5);
	});

	test("should compute positive sharpe for positive mean", () => {
		const scores = new EpisodeScores([1, 2, 3]);
		expect(scores.sharpe()).toBeGreaterThan(0);
	});
});
