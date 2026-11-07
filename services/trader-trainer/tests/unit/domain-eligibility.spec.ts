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

	it("walk-forward: MIN_TRAINING_STEPS per fold is accepted", () => {
		const steps = MIN_TRAINING_STEPS * 5;
		expect(hasEnoughTrainingData(steps + 1, 0.99, 5)).toBe(true);
	});

	it("walk-forward fallback uses the default split (0.2), not the configured one", () => {
		// 49 steps < 50: splitter falls back to 0.2 -> 39 train steps, accepted even with split 0.99.
		expect(hasEnoughTrainingData(50, 0.99, 5)).toBe(true);
		// 12 steps -> floor(12 * 0.8) = 9: refused.
		expect(hasEnoughTrainingData(13, 0.99, 5)).toBe(false);
		expect(hasEnoughTrainingData(14, 0.99, 5)).toBe(true);
	});
});
