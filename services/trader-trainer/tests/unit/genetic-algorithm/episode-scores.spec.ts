import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";

describe("EpisodeScores near-zero dispersion", () => {
	it("sharpe is continuous between std 1e-11 and 1e-9", () => {
		const a = new EpisodeScores([1, 1 + 2e-11]).sharpe();
		const b = new EpisodeScores([1, 1 + 2e-9]).sharpe();
		expect(b / a).toBeLessThan(10);
	});

	it("degenerate series stay bounded near a realistic ratio of the same mean", () => {
		// realistic: mean 0.5, std ~1 -> ratios ~0.5
		const realistic = new EpisodeScores([1.5, -0.5]);
		const constant = new EpisodeScores([0.5, 0.5]);
		const noLoss = new EpisodeScores([0.5, 0.5, 0.5]);
		expect(constant.sharpe()).toBeLessThanOrEqual(15 * realistic.sharpe());
		expect(noLoss.sortino()).toBeLessThanOrEqual(15 * realistic.sortino());
		expect(noLoss.calmar()).toBeLessThanOrEqual(10);
		expect(new EpisodeScores([1, 1]).sharpe()).toBeLessThanOrEqual(10);
	});

	it("ranking: a no-trade agent does not beat a realistic profitable one by orders of magnitude", () => {
		const noTrade = new EpisodeScores([0.3, 0.3, 0.3, 0.3]);
		const trader = new EpisodeScores([2, -1, 1.5, 0.5]);
		for (const f of ["sharpe", "sortino", "calmar"] as const) {
			expect(noTrade[f]() / trader[f]()).toBeLessThan(10);
		}
	});

	it("nominal series unchanged", () => {
		expect(new EpisodeScores([1, 3]).sharpe()).toBeCloseTo(2 / Math.SQRT2);
	});

	it("composite stays in (-1, 1)", () => {
		expect(Math.abs(new EpisodeScores([0.5, 1]).composite())).toBeLessThan(1);
	});
});
