import { describe, expect, it } from "@jest/globals";
import {
	hasEnoughTrainingData,
	MIN_TRAINING_STEPS,
} from "../../src/domain/market-data/window-splitter";

describe("hasEnoughTrainingData", () => {
	it("single split: one candle short is refused, the threshold is accepted", () => {
		// 13 steps -> floor(13 * 0.8) = 10 training steps; 12 steps -> 9.
		expect(hasEnoughTrainingData(13, 0.2, 1)).toBe(false);
		expect(hasEnoughTrainingData(14, 0.2, 1)).toBe(true);
	});

	it("walk-forward: MIN_TRAINING_STEPS per fold is accepted, one less falls back to the single split", () => {
		const folds = 5;
		const steps = MIN_TRAINING_STEPS * folds;
		expect(hasEnoughTrainingData(steps + 1, 0.99, folds)).toBe(true);
		expect(hasEnoughTrainingData(steps, 0.99, folds)).toBe(false);
	});
});
