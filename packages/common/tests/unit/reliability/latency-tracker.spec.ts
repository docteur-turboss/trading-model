import { describe, expect, it } from "@jest/globals";
import { LatencyTracker } from "../../../src/reliability/latency-tracker";

describe("LatencyTracker", () => {
	it("should expose windowSize", () => {
		const tracker = new LatencyTracker(10, 100);
		expect(tracker.windowSize).toBe(10);
	});

	it("should not track when windowSize is zero or negative", () => {
		const tracker = new LatencyTracker(0, 100);
		expect(tracker.update("k", 50)).toBeUndefined();
	});

	it("should not report before enough samples are collected", () => {
		const tracker = new LatencyTracker(10, 100);
		for (let i = 0; i < 9; i++) {
			expect(tracker.update("k", 50)).toBeUndefined();
		}
	});

	it("should not report when threshold is disabled", () => {
		const tracker = new LatencyTracker(10, 0);
		for (let i = 0; i < 10; i++) {
			tracker.update("k", 1000);
		}
		expect(tracker.update("k", 1000)).toBeUndefined();
	});

	it("should not report when p99 is within threshold", () => {
		const tracker = new LatencyTracker(10, 1000);
		for (let i = 0; i < 10; i++) {
			tracker.update("k", 50);
		}
		expect(tracker.update("k", 100)).toBeUndefined();
	});

	it("should report p99 when threshold is exceeded", () => {
		const tracker = new LatencyTracker(10, 100);
		for (let i = 0; i < 10; i++) {
			tracker.update("k", 50);
		}
		expect(tracker.update("k", 1000)).toBe(1000);
	});

	it("should delete and clear windows", () => {
		const tracker = new LatencyTracker(10, 100);
		for (let i = 0; i < 10; i++) {
			tracker.update("k", 50);
		}
		tracker.delete("k");
		for (let i = 0; i < 10; i++) {
			tracker.update("k", 50);
		}
		tracker.clear();
		expect(tracker.update("k", 50)).toBeUndefined();
	});
});
