import { describe, expect, it } from "@jest/globals";
import {
	EMBARGO_STEPS,
	hasEnoughTrainingData,
	MIN_TRAINING_STEPS,
} from "../../../../src/domain/market-data/window-splitter";

describe("hasEnoughTrainingData", () => {
	it("single split: each of train, validation and test needs MIN_TRAINING_STEPS", () => {
		expect(hasEnoughTrainingData(60, 0.2, 1, 0.15)).toBe(false);
		// 100 candles: 99 steps -> test 15 = 7 after the embargo: too few.
		expect(hasEnoughTrainingData(100, 0.2, 1, 0.15)).toBe(false);
		// 120 candles: 119 steps -> test 18 = 10, rest 101, train 80, validation 21 = 13.
		expect(hasEnoughTrainingData(120, 0.2, 1, 0.15)).toBe(true);
		// 0.5 test split of 29 steps: test 15, rest 14, train 11, validation 3.
		expect(hasEnoughTrainingData(30, 0.2, 1, 0.5)).toBe(false);
	});

	it("walk-forward: MIN_TRAINING_STEPS plus the embargo per fold is accepted", () => {
		const rest = (MIN_TRAINING_STEPS + EMBARGO_STEPS) * 5;
		// 181 candles: 180 steps -> rest 153 >= 90.
		expect(hasEnoughTrainingData(rest * 2 + 1, 0.99, 5)).toBe(true);
	});

	it("walk-forward fallback uses the default validation split, not the configured one", () => {
		// 139 steps: test 21 = 13, rest 118 >= 90 folds -> accepted.
		expect(hasEnoughTrainingData(140, 0.99, 5)).toBe(true);
		// 60 steps: test 9 < 10, refused whatever the folds.
		expect(hasEnoughTrainingData(61, 0.99, 5)).toBe(false);
	});
});
