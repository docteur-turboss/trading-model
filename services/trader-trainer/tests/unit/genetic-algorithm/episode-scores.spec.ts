import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";

describe("EpisodeScores near-zero dispersion", () => {
	it("sharpe is continuous between std 1e-11 and 1e-9", () => {
		const a = new EpisodeScores([1, 1 + 2e-11]).sharpe();
		const b = new EpisodeScores([1, 1 + 2e-9]).sharpe();
		expect(b / a).toBeLessThan(10);
		expect(b).toBeLessThanOrEqual(1e6 * 1.01);
	});

	it("sortino and calmar are bounded without loss", () => {
		const s = new EpisodeScores([1, 2]);
		expect(s.sortino()).toBeLessThanOrEqual(1e6);
		expect(s.calmar()).toBeLessThanOrEqual(1e6);
	});

	it("nominal series unchanged", () => {
		expect(new EpisodeScores([1, 3]).sharpe()).toBeCloseTo(2 / Math.SQRT2);
	});

	it("composite stays in (-1, 1)", () => {
		expect(Math.abs(new EpisodeScores([0.5, 1]).composite())).toBeLessThan(1);
	});
});
