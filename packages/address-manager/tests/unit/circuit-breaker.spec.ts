import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { DiscoveryCircuitBreaker } from "../../src/application/discovery/circuit-breaker";
import { CIRCUIT_BREAKER_STATE } from "../../src/infrastructure/metrics";

describe("CircuitBreaker", () => {
	let circuitBreaker: DiscoveryCircuitBreaker;

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		circuitBreaker.clear();
		jest.useRealTimers();
	});

	describe("default constructor", () => {
		beforeEach(() => {
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
			});
		});

		it("should allow requests when no failures recorded", () => {
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("should be closed initially", () => {
			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
		});

		it("should open after failureThreshold failures", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(true);
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(false);
		});

		it("should not open below failureThreshold", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("should transition to HALF_OPEN after cooldown period", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(false);

			jest.advanceTimersByTime(30_000);

			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("should close on recordSuccess after HALF_OPEN", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			jest.advanceTimersByTime(30_000);

			circuitBreaker.isAllowed(toInstanceId("instance-1"));
			circuitBreaker.recordSuccess(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("should reset failures on recordSuccess in CLOSED state", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordSuccess(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
		});

		it("should clear all state on clear()", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(true);

			circuitBreaker.clear();

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
		});

		it("should keep OPEN after another failure in HALF_OPEN", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			jest.advanceTimersByTime(30_000);

			circuitBreaker.isAllowed(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(true);
		});
	});

	describe("sweepStaleEntries", () => {
		beforeEach(() => {
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
			});
		});

		it("should sweep entries older than MAX_ENTRY_AGE_MS in CLOSED state", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordSuccess(toInstanceId("instance-1"));

			jest.advanceTimersByTime(5 * 60_000 + 1000);
			jest.advanceTimersByTime(60_000);

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
		});
	});

	describe("additional methods", () => {
		beforeEach(() => {
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
			});
		});

		it("getState should return 'closed' for unknown instance", () => {
			expect(circuitBreaker.getState(toInstanceId("unknown"))).toBe("closed");
		});

		it("getState should return correct state", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			expect(circuitBreaker.getState(toInstanceId("instance-1"))).toBe("open");
		});

		it("getFailureCount should return 0 for unknown instance", () => {
			expect(circuitBreaker.getFailureCount(toInstanceId("unknown"))).toBe(0);
		});

		it("getFailureCount should return correct count", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				1
			);
		});

		it("getStateSummary should return counts", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			const summary = circuitBreaker.getStateSummary();
			expect(summary.open).toBe(1);
			expect(summary.closed).toBe(0);
		});

		it("recordSuccess should no-op for unknown instance", () => {
			circuitBreaker.recordSuccess(toInstanceId("unknown"));
			expect(circuitBreaker.getFailureCount(toInstanceId("unknown"))).toBe(0);
		});

		it("isAllowed should return true when circuit is half-open", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			jest.advanceTimersByTime(30_000);
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
			expect(circuitBreaker.getState(toInstanceId("instance-1"))).toBe(
				"half-open"
			);
			expect(circuitBreaker.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("should keep half-open state between isAllowed calls", () => {
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed(toInstanceId("i-1"));
			expect(circuitBreaker.getState(toInstanceId("i-1"))).toBe("half-open");
			expect(circuitBreaker.isAllowed(toInstanceId("i-1"))).toBe(true);
		});

		it("should not transition to half-open before cooldown", () => {
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			circuitBreaker.recordFailure(toInstanceId("i-1"));
			jest.advanceTimersByTime(5000);
			expect(circuitBreaker.isAllowed(toInstanceId("i-1"))).toBe(false);
		});

		it("recordLatency should treat high P99 as failure", () => {
			for (let i = 0; i < 10; i++) {
				circuitBreaker.recordLatency(toInstanceId("instance-1"), 6000);
			}
			expect(
				circuitBreaker.getFailureCount(toInstanceId("instance-1"))
			).toBeGreaterThan(0);
		});

		it("recordLatency should not record failure below threshold", () => {
			for (let i = 0; i < 10; i++) {
				circuitBreaker.recordLatency(toInstanceId("instance-1"), 100);
			}
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				0
			);
		});

		it("recordLatency should not record failure before 10 samples", () => {
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordLatency(toInstanceId("instance-1"), 6000);
			}
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				0
			);
		});

		it("_sweepStaleEntries should not sweep recent entries", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			jest.advanceTimersByTime(60_000);
			expect(
				circuitBreaker.getFailureCount(toInstanceId("instance-1"))
			).toBeGreaterThan(0);
		});
	});

	describe("check()", () => {
		beforeEach(() => {
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
			});
		});

		it("should return closed for unknown instance", () => {
			expect(circuitBreaker.check(toInstanceId("unknown"))).toBe("closed");
		});

		it("should return open for tripped instance", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			expect(circuitBreaker.check(toInstanceId("instance-1"))).toBe("open");
		});
	});

	describe("call()", () => {
		beforeEach(() => {
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
			});
		});

		it("should invoke fn and recordSuccess when circuit is CLOSED", async () => {
			const fn = jest.fn<() => Promise<string>>().mockResolvedValue("ok");
			const result = await circuitBreaker.call(toInstanceId("instance-1"), fn);
			expect(result).toBe("ok");
			expect(fn).toHaveBeenCalledTimes(1);
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				0
			);
		});

		it("should throw when circuit is OPEN and no fallback", async () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			const fn = jest.fn<() => Promise<string>>();
			await expect(
				circuitBreaker.call(toInstanceId("instance-1"), fn)
			).rejects.toThrow("Circuit breaker OPEN");
			expect(fn).not.toHaveBeenCalled();
		});

		it("should return fallback when circuit is OPEN and fallback provided", async () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			const fn = jest.fn<() => Promise<string>>();
			const fallback = jest.fn<() => string>().mockReturnValue("fallback");
			const result = await circuitBreaker.call(
				toInstanceId("instance-1"),
				fn,
				fallback
			);
			expect(result).toBe("fallback");
			expect(fn).not.toHaveBeenCalled();
			expect(fallback).toHaveBeenCalledTimes(1);
		});

		it("should recordFailure and re-throw when fn throws and no fallback", async () => {
			const error = new Error("fn error");
			const fn = jest.fn<() => Promise<string>>().mockRejectedValue(error);

			await expect(
				circuitBreaker.call(toInstanceId("instance-1"), fn)
			).rejects.toThrow("fn error");
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				1
			);
		});

		it("should recordFailure and return fallback when fn throws and fallback provided", async () => {
			const fn = jest
				.fn<() => Promise<string>>()
				.mockRejectedValue(new Error("fn error"));
			const fallback = jest.fn<() => string>().mockReturnValue("fallback-ok");

			const result = await circuitBreaker.call(
				toInstanceId("instance-1"),
				fn,
				fallback
			);
			expect(result).toBe("fallback-ok");
			expect(circuitBreaker.getFailureCount(toInstanceId("instance-1"))).toBe(
				1
			);
			expect(fallback).toHaveBeenCalledTimes(1);
		});
	});

	describe("CircuitBreakerLatency branch coverage", () => {
		let cb: DiscoveryCircuitBreaker;

		beforeEach(() => {
			jest.useFakeTimers();
			cb = new DiscoveryCircuitBreaker({
				failureThreshold: 5,
				halfOpenTimeoutMs: 30000,
				latencyWindowSize: 10,
				latencyP99ThresholdMs: 100,
			});
		});

		afterEach(() => {
			cb.clear();
			jest.useRealTimers();
		});

		it("should NOT check threshold with exactly 9 samples (window.count >= 10 = false)", () => {
			for (let i = 0; i < 9; i++) {
				cb.recordLatency(toInstanceId("latency-1"), 200);
			}
			expect(cb.getFailureCount(toInstanceId("latency-1"))).toBe(0);
		});

		it("should check threshold with 10+ samples exceeding threshold (p99 > threshold = true)", () => {
			for (let i = 0; i < 10; i++) {
				cb.recordLatency(toInstanceId("latency-2"), 200);
			}
			expect(cb.getFailureCount(toInstanceId("latency-2"))).toBeGreaterThan(0);
		});

		it("should check threshold with 10+ samples below threshold (p99 > threshold = false)", () => {
			for (let i = 0; i < 10; i++) {
				cb.recordLatency(toInstanceId("latency-3"), 50);
			}
			expect(cb.getFailureCount(toInstanceId("latency-3"))).toBe(0);
		});

		it("should cap count at windowSize when samples exceed window (count < windowSize = false)", () => {
			for (let i = 0; i < 15; i++) {
				cb.recordLatency(toInstanceId("latency-4"), 50);
			}
			expect(cb.getFailureCount(toInstanceId("latency-4"))).toBe(0);
		});
	});
});

describe("DiscoveryCircuitBreaker gauge", () => {
	it("sets address_manager_circuit_breaker_state on every transition", async () => {
		const cb = new DiscoveryCircuitBreaker({
			failureThreshold: 2,
			halfOpenTimeoutMs: 60_000,
		});
		const id = toInstanceId("gauge-1");
		const read = async () =>
			(await CIRCUIT_BREAKER_STATE.get()).values.find(
				(v) => v.labels.instanceId === "gauge-1"
			)?.value;
		cb.recordSuccess(id);
		expect(await read()).toBe(0);
		cb.recordFailure(id);
		cb.recordFailure(id);
		expect(await read()).toBe(1);
		cb.removeMachine("gauge-1");
		expect(await read()).toBeUndefined();
		cb.stop();
	});

	it("publishes open then half-open through isOpen (the discovery path)", async () => {
		jest.useFakeTimers();
		const cb = new DiscoveryCircuitBreaker({
			failureThreshold: 1,
			halfOpenTimeoutMs: 10_000,
		});
		const id = toInstanceId("gauge-2");
		const read = async () =>
			(await CIRCUIT_BREAKER_STATE.get()).values.find(
				(v) => v.labels.instanceId === "gauge-2"
			)?.value;
		cb.recordFailure(id);
		expect(cb.isOpen(id)).toBe(true);
		expect(await read()).toBe(1);
		jest.advanceTimersByTime(10_001);
		// isOpen closes an expired circuit directly (no half-open on this path).
		expect(cb.isOpen(id)).toBe(false);
		expect(await read()).toBe(0);
		cb.clear();
		jest.useRealTimers();
	});

	it("drops the series of an open instance nobody consults any more", async () => {
		jest.useFakeTimers();
		const cb = new DiscoveryCircuitBreaker({
			failureThreshold: 1,
			halfOpenTimeoutMs: 10_000,
		});
		const id = toInstanceId("gauge-4");
		cb.recordFailure(id);
		jest.advanceTimersByTime(6 * 60_000);
		const series = (await CIRCUIT_BREAKER_STATE.get()).values.find(
			(v) => v.labels.instanceId === "gauge-4"
		);
		expect(series).toBeUndefined();
		cb.clear();
		jest.useRealTimers();
	});
});
