import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { DiscoveryCircuitBreaker } from "../../src/discovery/circuit-breaker";
import type { ICircuitStateStore } from "../../src/discovery/circuit-state-store";
import type { CircuitState } from "../../src/discovery/service-cache.interface";

function createMockStateStore(): jest.Mocked<ICircuitStateStore> {
	return {
		setCircuitState: jest
			.fn<(instanceId: string, state: CircuitState) => Promise<void>>()
			.mockResolvedValue(undefined),
		getCircuitState: jest
			.fn<(instanceId: string) => Promise<CircuitState | null>>()
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
					failures: 1,
					lastFailureTime: expect.any(Number),
					state: "closed",
				}
			);

			circuitBreaker.recordFailure(toInstanceId("instance-1"));
			circuitBreaker.recordFailure(toInstanceId("instance-1"));

			expect(mockCache.setCircuitState).toHaveBeenCalledWith(
				toInstanceId("instance-1"),
				{
					failures: 3,
					lastFailureTime: expect.any(Number),
					state: "open",
				}
			);
		});

		it("should load state from store on loadFromStore", async () => {
			const persistedState: CircuitState = {
				failures: 5,
				lastFailureTime: Date.now() - 5000,
				state: "open",
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
				failures: 5,
				lastFailureTime: Date.now() - 5000,
				state: "open",
			};
			mockCache.getCircuitState.mockResolvedValue(persistedState);
			await circuitBreaker.loadFromStore(toInstanceId("instance-1"));
			expect(circuitBreaker.isOpen(toInstanceId("instance-1"))).toBe(false);
		});
	});
});
