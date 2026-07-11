import { describe, expect, it, jest } from "@jest/globals";
import { TimerHandle } from "../../../src/utils/timer-handle";

describe("TimerHandle", () => {
	it("should not be running initially", () => {
		const handle = new TimerHandle();
		expect(handle.isRunning).toBe(false);
	});

	it("should be running after startInterval", () => {
		jest.useFakeTimers();
		const handle = new TimerHandle();
		handle.startInterval(jest.fn(), 1000);
		expect(handle.isRunning).toBe(true);
		handle.stop();
		jest.useRealTimers();
	});

	it("should be running after startTimeout", () => {
		jest.useFakeTimers();
		const handle = new TimerHandle();
		handle.startTimeout(jest.fn(), 1000);
		expect(handle.isRunning).toBe(true);
		handle.stop();
		jest.useRealTimers();
	});

	it("should stop and clear handle", () => {
		jest.useFakeTimers();
		const handle = new TimerHandle();
		handle.startInterval(jest.fn(), 1000);
		handle.stop();
		expect(handle.isRunning).toBe(false);
		jest.useRealTimers();
	});

	it("should be safe to stop when not running", () => {
		const handle = new TimerHandle();
		handle.stop();
	});

	it("should be safe to unref when not running", () => {
		const handle = new TimerHandle();
		handle.unref();
	});
});
