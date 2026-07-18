import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CircuitState as CircuitStateEnum } from "@trading-model/common/domain/circuit-state";
import {
	PositiveInt,
	toInstanceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { DiscoveryCircuitBreaker } from "../../src/discovery/circuit-breaker";
import type { ICircuitStateStore } from "../../src/discovery/circuit-state-store.interface";
import type { PersistedCircuitState } from "../../src/discovery/service-cache.interface";

function createMockStateStore(): jest.Mocked<ICircuitStateStore> {
	return {
		setCircuitState: jest
			.fn<(instanceId: string, state: PersistedCircuitState) => Promise<void>>()
			.mockResolvedValue(undefined),
		getCircuitState: jest
			.fn<(instanceId: string) => Promise<PersistedCircuitState | null>>()
			.mockResolvedValue(null),
		deleteCircuitState: jest
			.fn<(instanceId: string) => Promise<void>>()
			.mockResolvedValue(undefined),
	};
}

describe("CircuitBreaker", () => {
	let circuitBreaker: DiscoveryCircuitBreaker;

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		circuitBreaker.clear();
		jest.useRealTimers();
	});

	describe("default constructor (no stateStore)", () => {
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

	describe("with stateStore", () => {
		let mockCache: jest.Mocked<ICircuitStateStore>;

		beforeEach(() => {
			mockCache = createMockStateStore();
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
				stateStore: mockCache,
				loadFromStoreCacheTtlMs: 2_000,
				latencyWindowSize: 100,
				latencyP99ThresholdMs: 5000,
			});
		});

		it("should persist state on every failure", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(mockCache.setCircuitState).toHaveBeenCalledWith(
				toInstanceId("instance-1"),
				{
					failures: PositiveInt.of(1),
					lastFailureTime: expect.any(Number) as unknown as UnixTimestamp,
					state: CircuitStateEnum.CLOSED,
				}
			);

			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(mockCache.setCircuitState).toHaveBeenCalledWith(
				toInstanceId("instance-1"),
				{
					failures: PositiveInt.of(3),
					lastFailureTime: expect.any(Number) as unknown as UnixTimestamp,
					state: CircuitStateEnum.OPEN,
				}
			);
		});

		it("should load state from store on loadFromStore", async () => {
			const persistedState: CircuitState = {
				failures: PositiveInt.of(5),
				lastFailureTime: UnixTimestamp.of(Date.now() - 5000),
				state: CircuitStateEnum.OPEN,
			};
			mockCache.getCircuitState.mockResolvedValue(persistedState);

			await circuitBreaker.loadFromStore(toInstanceId("instance-1"));

			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(true);
		});

		it("should delete persisted state on recordSuccess", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed(toInstanceId("instance-1"));
			circuitBreaker.recordSuccess(toInstanceId("instance-1"));

			expect(mockCache.deleteCircuitState).toHaveBeenCalledWith(
				toInstanceId("instance-1")
			);
		});

		it("should delete persisted state on clear()", () => {
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			circuitBreaker.clear();

			expect(mockCache.deleteCircuitState).toHaveBeenCalledWith(
				toInstanceId("instance-1")
			);
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

	describe("with stateStore error handling", () => {
		let mockCache: jest.Mocked<ICircuitStateStore>;

		beforeEach(() => {
			mockCache = createMockStateStore();
			circuitBreaker = new DiscoveryCircuitBreaker({
				failureThreshold: 3,
				halfOpenTimeoutMs: 10_000,
				stateStore: mockCache,
			});
		});

		it("should handle persist failure gracefully", () => {
			mockCache.setCircuitState.mockRejectedValue(new Error("persist error"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			expect(mockCache.setCircuitState).toHaveBeenCalled();
		});

		it("should handle delete persisted state failure gracefully", () => {
			mockCache.deleteCircuitState.mockRejectedValue(new Error("delete error"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed(toInstanceId("instance-1"));
			circuitBreaker.recordSuccess(toInstanceId("instance-1"));
			expect(mockCache.deleteCircuitState).toHaveBeenCalled();
		});

		it("loadFromStore should no-op when no stateStore", async () => {
			const cb = new DiscoveryCircuitBreaker();
			await cb.loadFromStore(toInstanceId("instance-1"));
			expect(cb.isAllowed(toInstanceId("instance-1"))).toBe(true);
		});

		it("loadFromStore should skip when cached recently", async () => {
			await circuitBreaker.loadFromStore(toInstanceId("instance-1"));
			const persistedState: CircuitState = {
				failures: PositiveInt.of(5),
				lastFailureTime: UnixTimestamp.of(Date.now() - 5000),
				state: CircuitStateEnum.OPEN,
			};
			mockCache.getCircuitState.mockResolvedValue(persistedState);
			await circuitBreaker.loadFromStore(toInstanceId("instance-1"));
			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
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

	describe("CircuitBreakerPersistence branch coverage", () => {
		let persistenceMock: jest.Mocked<ICircuitStateStore>;
		let cb: DiscoveryCircuitBreaker;

		beforeEach(() => {
			jest.useFakeTimers();
			persistenceMock = createMockStateStore();
			cb = new DiscoveryCircuitBreaker({
				failureThreshold: 5,
				halfOpenTimeoutMs: 30000,
				stateStore: persistenceMock,
				loadFromStoreCacheTtlMs: 2000,
				latencyWindowSize: 10,
				latencyP99ThresholdMs: 100,
			});
		});

		afterEach(() => {
			cb.clear();
			jest.useRealTimers();
		});

		it("loadFromStore should early return when cache is valid (_isCacheValid = true)", async () => {
			await cb.loadFromStore(toInstanceId("persist-cache-valid"));
			persistenceMock.getCircuitState.mockClear();
			await cb.loadFromStore(toInstanceId("persist-cache-valid"));
			expect(persistenceMock.getCircuitState).not.toHaveBeenCalled();
		});

		it("loadFromStore should handle no persisted state (persisted = false)", async () => {
			persistenceMock.getCircuitState.mockResolvedValue(null);
			await cb.loadFromStore(toInstanceId("persist-none"));
			expect(cb.isOpen(toInstanceId("persist-none"))).toBe(false);
			expect(cb.getFailureCount(toInstanceId("persist-none"))).toBe(0);
		});

		it("loadFromStore should restore from persisted state (persisted = true)", async () => {
			const persistedState: CircuitState = {
				failures: PositiveInt.of(5),
				lastFailureTime: UnixTimestamp.of(Date.now() - 5000),
				state: CircuitStateEnum.OPEN,
			};
			persistenceMock.getCircuitState.mockResolvedValue(persistedState);
			await cb.loadFromStore(toInstanceId("persist-restore"));
			expect(cb.isOpen(toInstanceId("persist-restore"))).toBe(true);
		});

		it("loadFromStore should NOT restore when existing machine has more failures (_shouldRestoreFromPersisted = false)", async () => {
			cb.recordFailure(toInstanceId("persist-keep-local"));
			cb.recordFailure(toInstanceId("persist-keep-local"));
			const persistedState: CircuitState = {
				failures: PositiveInt.of(1),
				lastFailureTime: UnixTimestamp.of(Date.now() - 5000),
				state: CircuitStateEnum.CLOSED,
			};
			persistenceMock.getCircuitState.mockResolvedValue(persistedState);
			await cb.loadFromStore(toInstanceId("persist-keep-local"));
			expect(cb.getFailureCount(toInstanceId("persist-keep-local"))).toBe(2);
		});

		it("loadFromStore should restore when persisted has more failures than existing (!existingMachine || persisted.failures > existing = true)", async () => {
			cb.recordFailure(toInstanceId("persist-overwrite"));
			const persistedState: CircuitState = {
				failures: PositiveInt.of(5),
				lastFailureTime: UnixTimestamp.of(Date.now() - 5000),
				state: CircuitStateEnum.OPEN,
			};
			persistenceMock.getCircuitState.mockResolvedValue(persistedState);
			await cb.loadFromStore(toInstanceId("persist-overwrite"));
			expect(cb.isOpen(toInstanceId("persist-overwrite"))).toBe(true);
			expect(cb.getFailureCount(toInstanceId("persist-overwrite"))).toBe(5);
		});

		it("_buildStateData should persist OPEN state with computed lastFailureTime (openUntil > 0)", () => {
			for (let i = 0; i < 5; i++) {
				cb.recordFailure(toInstanceId("persist-state-open"));
			}
			expect(cb.isOpen(toInstanceId("persist-state-open"))).toBe(true);
			expect(persistenceMock.setCircuitState).toHaveBeenCalledWith(
				toInstanceId("persist-state-open"),
				expect.objectContaining({
					state: CircuitStateEnum.OPEN,
				})
			);
		});

		it("_buildStateData should persist CLOSED state with current time (openUntil = 0)", () => {
			cb.recordFailure(toInstanceId("persist-state-closed"));
			expect(persistenceMock.setCircuitState).toHaveBeenCalledWith(
				toInstanceId("persist-state-closed"),
				expect.objectContaining({
					state: CircuitStateEnum.CLOSED,
				})
			);
		});

		it("loadFromStore should reload when cache expires (_isCacheValid = false after TTL)", async () => {
			await cb.loadFromStore(toInstanceId("persist-cache-expire"));
			persistenceMock.getCircuitState.mockClear();
			jest.advanceTimersByTime(3000);
			await cb.loadFromStore(toInstanceId("persist-cache-expire"));
			expect(persistenceMock.getCircuitState).toHaveBeenCalled();
		});
	});
});
