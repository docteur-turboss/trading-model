import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { DurationMs } from "../../src/domain/primitives";

import { CircuitBreaker } from "../../src/reliability/circuit-breaker";

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

	it("isAllowed returns true when closed", () => {
		const cb = new CircuitBreaker();
		expect(cb.isAllowed("svc")).toBe(true);
	});

	it("isAllowed returns false when open", () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		cb.recordFailure("svc");
		expect(cb.isAllowed("svc")).toBe(false);
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

	it("call executes function successfully", async () => {
		const cb = new CircuitBreaker();
		const result = await cb.call("svc", async () => "success");
		expect(result).toBe("success");
	});

	it("call uses fallback when circuit is open", async () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		cb.recordFailure("svc");
		const result = await cb.call(
			"svc",
			async () => "should not run",
			() => "fallback"
		);
		expect(result).toBe("fallback");
	});

	it("call throws when circuit is open and no fallback", async () => {
		const cb = new CircuitBreaker({
			failureThreshold: 1,
			cooldownMs: 60000 as DurationMs,
		});
		cb.recordFailure("svc");
		await expect(
			cb.call("svc", async () => "should not run")
		).rejects.toThrow();
	});

	it("call uses fallback on function failure", async () => {
		const cb = new CircuitBreaker();
		const result = await cb.call(
			"svc",
			async () => {
				throw new Error("fail");
			},
			() => "fallback"
		);
		expect(result).toBe("fallback");
	});

	it("call rethrows on function failure without fallback", async () => {
		const cb = new CircuitBreaker();
		await expect(
			cb.call("svc", async () => {
				throw new Error("fail");
			})
		).rejects.toThrow("fail");
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
