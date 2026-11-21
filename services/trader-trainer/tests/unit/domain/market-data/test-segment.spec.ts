import { describe, expect, it, jest } from "@jest/globals";
import type { WindowSet } from "../../../../src/domain/genetic-algorithm/generation-types";
import type { MarketStep } from "../../../../src/domain/genetic-algorithm/genome-fitness";
import type { MarketDataContext } from "../../../../src/domain/market-data/market-data-context";
import {
	EMBARGO_STEPS,
	hasEnoughTrainingData,
	MIN_TRAINING_STEPS,
	WindowSplitter,
} from "../../../../src/domain/market-data/window-splitter";

const makeSteps = (n: number): MarketStep[] =>
	Array.from({ length: n }, (_, i) => ({
		price: 1 as never,
		features: [] as never,
		timestamp: i,
	}));
const ts = (steps: MarketStep[]): number[] =>
	steps.map((s) => s.timestamp as number);

const ctx = { symbol: "BTCUSDT" } as unknown as MarketDataContext;
const withSteps = (n: number) => {
	const s = new WindowSplitter(new Map());
	jest.spyOn(s, "buildMarketSteps").mockReturnValue(makeSteps(n));
	return s;
};

describe("train | validation | test split (issue #885)", () => {
	it("cuts three disjoint segments in time order, an embargo between each", () => {
		const ws = withSteps(200).getAllWindows(
			ctx,
			0.15,
			1,
			0.15
		)![0] as Required<WindowSet>;
		expect(ws.test).toHaveLength(30 - EMBARGO_STEPS);
		const all = [...ts(ws.train), ...ts(ws.validation), ...ts(ws.test)];
		expect(all).toHaveLength(200 - 2 * EMBARGO_STEPS);
		expect(all).toEqual([...all].sort((a, b) => a - b));
		for (const seg of [ws.train, ws.validation, ws.test]) {
			expect(seg.length).toBeGreaterThanOrEqual(MIN_TRAINING_STEPS);
		}
	});

	it("never lets train or validation reach a test timestamp, in walk-forward too", () => {
		const sets = withSteps(200).getAllWindows(
			ctx,
			0.15,
			4,
			0.15
		) as Required<WindowSet>[];
		for (const ws of sets) {
			const firstTest = Math.min(...ts(ws.test));
			expect(Math.max(...ts(ws.train), ...ts(ws.validation))).toBeLessThan(
				firstTest
			);
		}
	});

	it("returns null when the test segment would be under MIN_TRAINING_STEPS", () => {
		expect(withSteps(40).getAllWindows(ctx, 0.15, 1, 0.1)).toBeNull();
	});

	it("hasEnoughTrainingData requires MIN_TRAINING_STEPS in each segment", () => {
		// 499 steps (default buffer): 75 test, 64 validation, 360 train.
		expect(hasEnoughTrainingData(500, 0.15, 1, 0.15)).toBe(true);
		// 60 steps: test 9 < 10.
		expect(hasEnoughTrainingData(61, 0.15, 1, 0.15)).toBe(false);
		// 70 steps: test 11, rest 59, validation 9 < 10.
		expect(hasEnoughTrainingData(71, 0.15, 1, 0.15)).toBe(false);
	});
});
