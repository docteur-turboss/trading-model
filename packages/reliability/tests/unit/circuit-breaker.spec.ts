import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { DurationMs } from "@trading-model/primitives/primitives";

import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe("CircuitBreaker", () => {
	it("starts in closed state for any key", () => {
		const cb = new CircuitBreaker();
		expect(cb.check("svc-a")).toBe("closed");
	});

	it("opens after exceeding failure threshold", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 3,
			cooldownMs: 60000 as DurationMs,
		});

		expect(cb.check("svc-a")).toBe("closed");
		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("closed");
		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("closed");
		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("open");
	});

	it("closes again after recordSuccess", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});

		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("open");

		cb.recordSuccess("svc-a");
		expect(cb.check("svc-a")).toBe("closed");
	});

	it("uses default config when no options provided", () => {
		const cb = new CircuitBreaker();

		expect(cb.check("svc")).toBe("closed");
		for (let i = 0; i < 5; i++) {
			cb.recordFailure("svc");
		}
		expect(cb.check("svc")).toBe("open");
	});

	it("tracks keys independently", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 2,
			cooldownMs: 60000 as DurationMs,
		});

		cb.recordFailure("svc-a");
		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("open");
		expect(cb.check("svc-b")).toBe("closed");
	});

	it("transitions to half-open after cooldown", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 10 as DurationMs,
		});

		cb.recordFailure("svc-a");
		expect(cb.check("svc-a")).toBe("open");

		jest.advanceTimersByTime(15);
		expect(cb.check("svc-a")).toBe("half-open");
	});

	it("getState returns the circuit state", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		expect(cb.getState("svc")).toBe("closed");
		cb.recordFailure("svc");
		expect(cb.getState("svc")).toBe("open");
	});

	it("getFailureCount returns failure count", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: 60000 as DurationMs,
		});
		expect(cb.getFailureCount("svc")).toBe(0);
		cb.recordFailure("svc");
		expect(cb.getFailureCount("svc")).toBe(1);
	});

	it("isOpen returns true when open", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		cb.recordFailure("svc");
		expect(cb.isOpen("svc")).toBe(true);
	});

	it("clear resets all machines", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		cb.recordFailure("svc-a");
		cb.recordFailure("svc-b");
		expect(cb.getState("svc-a")).toBe("open");
		cb.clear();
		expect(cb.getState("svc-a")).toBe("closed");
		expect(cb.getState("svc-b")).toBe("closed");
	});
});

describe("CircuitBreaker machine registry", () => {
	it("should create and reuse machines per key", () => {
		const registry = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		const a = registry.getMachine("a");
		expect(registry.getMachine("a")).toBe(a);
		expect(registry.getMachine("b")).not.toBe(a);
	});

	it("should iterate over all machines", () => {
		const registry = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		registry.getMachine("a");
		registry.getMachine("b");
		const keys: string[] = [];
		registry.forEachMachine((key) => keys.push(key));
		expect(keys.sort()).toEqual(["a", "b"]);
	});

	it("should summarize machine states", () => {
		jest.useFakeTimers();
		const registry = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: DurationMs.of(60_000),
		});
		registry.getMachine("closed");
		registry.getMachine("a").recordFailure();
		registry.getMachine("b").recordFailure();
		jest.advanceTimersByTime(60_001);
		const summary = registry.getStateSummary();
		expect(summary[CircuitState.CLOSED]).toBe(1);
		expect(summary[CircuitState.OPEN]).toBe(0);
		expect(summary[CircuitState.HALF_OPEN]).toBe(2);
		jest.useRealTimers();
	});

	it("should remove machines", () => {
		const registry = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		registry.getMachine("a");
		registry.removeMachine("a");
		const keys: string[] = [];
		registry.forEachMachine((key) => keys.push(key));
		expect(keys).toEqual([]);
	});

	it("should clear all machines", () => {
		const registry = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		registry.getMachine("a");
		registry.getMachine("b");
		registry.clear();
		const keys: string[] = [];
		registry.forEachMachine((key) => keys.push(key));
		expect(keys).toEqual([]);
	});
});
