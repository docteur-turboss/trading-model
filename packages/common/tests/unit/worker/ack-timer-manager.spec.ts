import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { AckTimerManager } from "../../../src/worker/ack-timer-manager";

describe("AckTimerManager", () => {
	let manager: AckTimerManager;

	beforeEach(() => {
		jest.useFakeTimers();
		manager = new AckTimerManager();
	});

	afterEach(() => {
		manager.clearAll();
		jest.useRealTimers();
	});

	it("should start with size 0", () => {
		expect(manager.size).toBe(0);
	});

	it("should start and track a timer", () => {
		const onTimeout = jest.fn();
		manager.start("job-1", Date.now() + 1000, onTimeout);
		expect(manager.size).toBe(1);
	});

	it("should fire timeout after deadline", () => {
		const onTimeout = jest.fn();
		manager.start("job-1", Date.now() + 1000, onTimeout);
		jest.advanceTimersByTime(1001);
		expect(onTimeout).toHaveBeenCalled();
	});

	it("should clear a timer before deadline", () => {
		const onTimeout = jest.fn();
		manager.start("job-1", Date.now() + 1000, onTimeout);
		manager.clear("job-1");
		jest.advanceTimersByTime(1001);
		expect(onTimeout).not.toHaveBeenCalled();
		expect(manager.size).toBe(0);
	});

	it("should clear all timers", () => {
		const onTimeout = jest.fn();
		manager.start("job-1", Date.now() + 1000, onTimeout);
		manager.start("job-2", Date.now() + 2000, onTimeout);
		expect(manager.size).toBe(2);
		manager.clearAll();
		expect(manager.size).toBe(0);
		jest.advanceTimersByTime(3000);
		expect(onTimeout).not.toHaveBeenCalled();
	});

	it("should safely clear nonexistent timer", () => {
		expect(() => manager.clear("nonexistent")).not.toThrow();
	});
});
