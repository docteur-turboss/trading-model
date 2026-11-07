import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";

describe("EpisodeScores near-zero dispersion", () => {
	it("sharpe is continuous between std 1e-11 and 1e-9", () => {
		const a = new EpisodeScores([1, 1 + 2e-11]).sharpe();
		const b = new EpisodeScores([1, 1 + 2e-9]).sharpe();
		expect(b / a).toBeLessThan(10);
	});

	it("degenerate series score at most 10, a realistic order of magnitude", () => {
		const constant = new EpisodeScores([0.5, 0.5]);
		const noLoss = new EpisodeScores([0.5, 0.5, 0.5]);
		expect(constant.sharpe()).toBeCloseTo(10);
		expect(noLoss.sortino()).toBeCloseTo(10);
		expect(noLoss.calmar()).toBeCloseTo(10);
		expect(new EpisodeScores([1, 1]).sharpe()).toBeLessThanOrEqual(10);
	});

	it("ranking: a no-trade agent does not beat a realistic profitable one by orders of magnitude", () => {
		const noTrade = new EpisodeScores([0.3, 0.3, 0.3, 0.3]);
		const trader = new EpisodeScores([1, 2, 1.5, 0.5]);
		expect(noTrade.sharpe() / trader.sharpe()).toBeLessThan(10);
	});

	it("realistic series of mean < 1 and std < 0.1 keep mean / std", () => {
		const s = new EpisodeScores([0.05, -0.01]);
		expect(s.sharpe()).toBeCloseTo(s.mean() / Math.sqrt(s.variance()));
		expect(s.sharpe()).toBeGreaterThan(0.4);
		const wide = new EpisodeScores([0.05, -0.01, 0.05, 0.03]);
		const narrow = new EpisodeScores([0.03, 0.02, 0.03, 0.04]);
		expect(narrow.sharpe()).toBeGreaterThan(wide.sharpe());
	});

	it("zero mean gives 0, never NaN", () => {
		expect(new EpisodeScores([0, 0]).sharpe()).toBe(0);
		expect(new EpisodeScores([0, 0]).calmar()).toBe(0);
	});

	it("composite keeps resolution over |mean| in [0, 1]", () => {
		const f = (m: number) => new EpisodeScores([m, m]).composite();
		expect(f(0.5) - f(0.25)).toBeGreaterThan(0.05);
		expect(f(1) - f(0.5)).toBeGreaterThan(0.05);
	});

	it("nominal series unchanged", () => {
		expect(new EpisodeScores([1, 3]).sharpe()).toBeCloseTo(2 / Math.SQRT2);
	});

	it("composite stays in (-1, 1)", () => {
		expect(Math.abs(new EpisodeScores([0.5, 1]).composite())).toBeLessThan(1);
	});
});
