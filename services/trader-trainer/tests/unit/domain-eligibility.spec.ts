import { describe, expect, it } from "@jest/globals";
import {
	hasEnoughTrainingData,
	MIN_TRAINING_STEPS,
} from "../../src/domain/market-data/window-splitter";

describe("hasEnoughTrainingData", () => {
	it("single split: each of train, validation and test needs MIN_TRAINING_STEPS", () => {
		expect(hasEnoughTrainingData(60, 0.2, 1, 0.15)).toBe(false);
		// 100 candles: 99 steps -> test 15, rest 84, train 67, validation 17.
		expect(hasEnoughTrainingData(100, 0.2, 1, 0.15)).toBe(true);
		// 0.5 test split of 29 steps: test 15, rest 14, train 11, validation 3.
		expect(hasEnoughTrainingData(30, 0.2, 1, 0.5)).toBe(false);
	});

	it("walk-forward: MIN_TRAINING_STEPS per fold is accepted", () => {
		const rest = MIN_TRAINING_STEPS * 5;
		// 100 steps -> test 15, rest 85 >= 50.
		expect(hasEnoughTrainingData(rest * 2 + 1, 0.99, 5)).toBe(true);
	});

	it("walk-forward fallback uses the default validation split, not the configured one", () => {
		// 99 steps: test 14, rest 84 >= 50 folds -> accepted.
		expect(hasEnoughTrainingData(100, 0.99, 5)).toBe(true);
		// 60 steps: test 9 < 10, refused whatever the folds.
		expect(hasEnoughTrainingData(61, 0.99, 5)).toBe(false);
	});
});
