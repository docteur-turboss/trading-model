import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CircuitBreaker } from "../../src/discovery/circuit-breaker";
import type {
	CircuitState,
	IServiceCache,
} from "../../src/discovery/service-cache.interface";

function createMockCache(): jest.Mocked<IServiceCache> {
	const mock: Partial<jest.Mocked<IServiceCache>> = {
		get: jest.fn(),
		set: jest.fn(),
		invalidate: jest.fn(),
		clear: jest.fn<() => Promise<void>>().mockResolvedValue(),
		entries: jest
			.fn<
				() => Promise<
					Array<{ serviceName: string; instance: any; region?: string }>
				>
			>()
			.mockResolvedValue([]),
		stop: jest.fn(),
		setCircuitState: jest.fn<() => Promise<void>>().mockResolvedValue(),
		getCircuitState: jest.fn<() => Promise<any>>().mockResolvedValue(null),
		deleteCircuitState: jest.fn<() => Promise<void>>().mockResolvedValue(),
	};
	return mock as jest.Mocked<IServiceCache>;
}

describe("CircuitBreaker", () => {
	let circuitBreaker: CircuitBreaker;

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		circuitBreaker.clear();
		jest.useRealTimers();
	});

	describe("default constructor (no stateStore)", () => {
		beforeEach(() => {
			circuitBreaker = new CircuitBreaker(3, 10_000);
		});

		it("should allow requests when no failures recorded", () => {
			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
		});

		it("should be closed initially", () => {
			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
		});

		it("should open after failureThreshold failures", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(true);
			expect(circuitBreaker.isAllowed("instance-1")).toBe(false);
		});

		it("should not open below failureThreshold", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
		});

		it("should transition to HALF_OPEN after cooldown period", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(circuitBreaker.isAllowed("instance-1")).toBe(false);

			jest.advanceTimersByTime(30_000);

			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
		});

		it("should close on recordSuccess after HALF_OPEN", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			jest.advanceTimersByTime(30_000);

			circuitBreaker.isAllowed("instance-1");
			circuitBreaker.recordSuccess("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
		});

		it("should reset failures on recordSuccess in CLOSED state", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordSuccess("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
		});

		it("should clear all state on clear()", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(true);

			circuitBreaker.clear();

			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
		});

		it("should keep OPEN after another failure in HALF_OPEN", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			jest.advanceTimersByTime(30_000);

			circuitBreaker.isAllowed("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(true);
		});
	});

	describe("with stateStore", () => {
		let mockCache: jest.Mocked<IServiceCache>;

		beforeEach(() => {
			mockCache = createMockCache();
			circuitBreaker = new CircuitBreaker(
				3,
				10_000,
				mockCache,
				2_000,
				100,
				5000
			);
		});

		it("should persist state on every failure", () => {
			circuitBreaker.recordFailure("instance-1");

			expect(mockCache.setCircuitState).toHaveBeenCalledWith("instance-1", {
				failures: 1,
				lastFailureTime: expect.any(Number),
				state: "closed",
			});

			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			expect(mockCache.setCircuitState).toHaveBeenCalledWith("instance-1", {
				failures: 3,
				lastFailureTime: expect.any(Number),
				state: "open",
			});
		});

		it("should load state from store on loadFromStore", async () => {
			const persistedState: CircuitState = {
				failures: 5,
				lastFailureTime: Date.now() - 5000,
				state: "open",
			};
			mockCache.getCircuitState.mockResolvedValue(persistedState);

			await circuitBreaker.loadFromStore("instance-1");

			expect(circuitBreaker.isOpen("instance-1")).toBe(true);
		});

		it("should delete persisted state on recordSuccess", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed("instance-1");
			circuitBreaker.recordSuccess("instance-1");

			expect(mockCache.deleteCircuitState).toHaveBeenCalledWith("instance-1");
		});

		it("should delete persisted state on clear()", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");

			circuitBreaker.clear();

			expect(mockCache.deleteCircuitState).toHaveBeenCalledWith("instance-1");
		});
	});

	describe("sweepStaleEntries", () => {
		beforeEach(() => {
			circuitBreaker = new CircuitBreaker(3, 10_000);
		});

		it("should sweep entries older than MAX_ENTRY_AGE_MS in CLOSED state", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordSuccess("instance-1");

			jest.advanceTimersByTime(5 * 60_000 + 1000);
			jest.advanceTimersByTime(60_000);

			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
		});
	});

	describe("additional methods", () => {
		beforeEach(() => {
			circuitBreaker = new CircuitBreaker(3, 10_000);
		});

		it("getState should return 'closed' for unknown instance", () => {
			expect(circuitBreaker.getState("unknown")).toBe("closed");
		});

		it("getState should return correct state", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			expect(circuitBreaker.getState("instance-1")).toBe("open");
		});

		it("getFailureCount should return 0 for unknown instance", () => {
			expect(circuitBreaker.getFailureCount("unknown")).toBe(0);
		});

		it("getFailureCount should return correct count", () => {
			circuitBreaker.recordFailure("instance-1");
			expect(circuitBreaker.getFailureCount("instance-1")).toBe(1);
		});

		it("getStateSummary should return counts", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			const summary = circuitBreaker.getStateSummary();
			expect(summary.open).toBe(1);
			expect(summary.closed).toBe(0);
		});

		it("recordSuccess should no-op for unknown instance", () => {
			circuitBreaker.recordSuccess("unknown");
			expect(circuitBreaker.getFailureCount("unknown")).toBe(0);
		});

		it("isAllowed should return true when circuit is half-open", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			jest.advanceTimersByTime(30_000);
			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
			expect(circuitBreaker.getState("instance-1")).toBe("half-open");
			expect(circuitBreaker.isAllowed("instance-1")).toBe(true);
		});

		it("should keep half-open state between isAllowed calls", () => {
			circuitBreaker.recordFailure("i-1");
			circuitBreaker.recordFailure("i-1");
			circuitBreaker.recordFailure("i-1");
			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed("i-1");
			expect(circuitBreaker.getState("i-1")).toBe("half-open");
			expect(circuitBreaker.isAllowed("i-1")).toBe(true);
		});

		it("should not transition to half-open before cooldown", () => {
			circuitBreaker.recordFailure("i-1");
			circuitBreaker.recordFailure("i-1");
			circuitBreaker.recordFailure("i-1");
			jest.advanceTimersByTime(5000);
			expect(circuitBreaker.isAllowed("i-1")).toBe(false);
		});

		it("recordLatency should treat high P99 as failure", () => {
			for (let i = 0; i < 10; i++) {
				circuitBreaker.recordLatency("instance-1", 6000);
			}
			expect(circuitBreaker.getFailureCount("instance-1")).toBeGreaterThan(0);
		});

		it("recordLatency should not record failure below threshold", () => {
			for (let i = 0; i < 10; i++) {
				circuitBreaker.recordLatency("instance-1", 100);
			}
			expect(circuitBreaker.getFailureCount("instance-1")).toBe(0);
		});

		it("recordLatency should not record failure before 10 samples", () => {
			for (let i = 0; i < 5; i++) {
				circuitBreaker.recordLatency("instance-1", 6000);
			}
			expect(circuitBreaker.getFailureCount("instance-1")).toBe(0);
		});

		it("_sweepStaleEntries should not sweep recent entries", () => {
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			circuitBreaker.recordFailure("instance-1");
			jest.advanceTimersByTime(60_000);
			expect(circuitBreaker.isOpen("instance-1")).toBe(true);
		});
	});

	describe("with stateStore error handling", () => {
		let mockCache: jest.Mocked<IServiceCache>;

		beforeEach(() => {
			mockCache = createMockCache();
			circuitBreaker = new CircuitBreaker(3, 10_000, mockCache);
		});

		it("should handle persist failure gracefully", () => {
			mockCache.setCircuitState.mockRejectedValue(new Error("persist error"));
			circuitBreaker.recordFailure("instance-1");
			expect(mockCache.setCircuitState).toHaveBeenCalled();
		});

		it("should handle delete persisted state failure gracefully", () => {
			mockCache.deleteCircuitState.mockRejectedValue(new Error("delete error"));
			circuitBreaker.recordFailure("instance-1");
			jest.advanceTimersByTime(30_000);
			circuitBreaker.isAllowed("instance-1");
			circuitBreaker.recordSuccess("instance-1");
			expect(mockCache.deleteCircuitState).toHaveBeenCalled();
		});

		it("loadFromStore should no-op when no stateStore", async () => {
			const cb = new CircuitBreaker();
			await cb.loadFromStore("instance-1");
			expect(cb.isAllowed("instance-1")).toBe(true);
		});

		it("loadFromStore should skip when cached recently", async () => {
			await circuitBreaker.loadFromStore("instance-1");
			const persistedState = {
				failures: 5,
				lastFailureTime: Date.now() - 5000,
				state: "open" as const,
			};
			mockCache.getCircuitState.mockResolvedValue(persistedState);
			await circuitBreaker.loadFromStore("instance-1");
			expect(circuitBreaker.isOpen("instance-1")).toBe(false);
		});
	});
});
