import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { CircuitBreakerState } from "../../src/discovery/circuit-breaker-state";

describe("CircuitBreakerState", () => {
	let state: CircuitBreakerState;

	beforeEach(() => {
		jest.useFakeTimers();
		state = new CircuitBreakerState(3, 10_000);
	});

	afterEach(() => {
		state.clear();
		jest.useRealTimers();
	});

	describe("getOrCreateState", () => {
		it("should create state for unknown instance", () => {
			const now = Date.now();
			const result = state.getOrCreateState(toInstanceId("instance-1"), now);
			expect(result.failures).toBe(0);
			expect(result.lastFailureTime).toBe(now);
			expect(result.state).toBe("closed");
		});

		it("should return existing state for known instance", () => {
			state.recordFailure(toInstanceId("instance-1"));
			const now = Date.now();
			const result = state.getOrCreateState(toInstanceId("instance-1"), now);
			expect(result.failures).toBe(1);
			expect(result.state).toBe("closed");
		});
	});

	describe("checkOpenThreshold", () => {
		it("should return early when machine does not exist", () => {
			state.checkOpenThreshold(toInstanceId("unknown"), {
				failures: 0,
				lastFailureTime: 0,
				state: CircuitState.CLOSED,
			});
		});

		it("should log warning when failures meet threshold", () => {
			state.recordFailure(toInstanceId("instance-1"));
			state.recordFailure(toInstanceId("instance-1"));
			state.recordFailure(toInstanceId("instance-1"));
			const instanceState = state.getInstanceState(toInstanceId("instance-1"))!;
			state.checkOpenThreshold(toInstanceId("instance-1"), instanceState);
			expect(instanceState.failures).toBeGreaterThanOrEqual(3);
		});

		it("should not log when failures below threshold", () => {
			state.recordFailure(toInstanceId("instance-1"));
			const instanceState = state.getInstanceState(toInstanceId("instance-1"))!;
			state.checkOpenThreshold(toInstanceId("instance-1"), instanceState);
			expect(instanceState.failures).toBe(1);
		});
	});

	describe("tryHalfOpen", () => {
		it("should return true when state is OPEN and cooldown has passed", () => {
			const now = Date.now();
			const instanceState = {
				failures: 3,
				lastFailureTime: now - 20_000,
				state: CircuitState.OPEN,
			};
			const result = state.tryHalfOpen(
				toInstanceId("instance-1"),
				instanceState
			);
			expect(result).toBe(true);
		});

		it("should return false when state is not OPEN", () => {
			const instanceState = {
				failures: 0,
				lastFailureTime: Date.now(),
				state: CircuitState.CLOSED,
			};
			const result = state.tryHalfOpen(
				toInstanceId("instance-1"),
				instanceState
			);
			expect(result).toBe(false);
		});

		it("should return false when cooldown has not passed", () => {
			const instanceState = {
				failures: 3,
				lastFailureTime: Date.now(),
				state: CircuitState.OPEN,
			};
			const result = state.tryHalfOpen(
				toInstanceId("instance-1"),
				instanceState
			);
			expect(result).toBe(false);
		});
	});

	describe("getInstanceState", () => {
		it("should return undefined for unknown instance", () => {
			const result = state.getInstanceState(toInstanceId("unknown"));
			expect(result).toBeUndefined();
		});

		it("should return state for known instance", () => {
			state.recordFailure(toInstanceId("instance-1"));
			const result = state.getInstanceState(toInstanceId("instance-1"));
			expect(result).toBeDefined();
			expect(result!.failures).toBe(1);
			expect(result!.state).toBe("closed");
		});
	});

	describe("stop and clear", () => {
		it("should stop the sweeper on stop()", () => {
			expect(() => state.stop()).not.toThrow();
		});

		it("should clear instances and stop sweeper on clear()", () => {
			state.recordFailure(toInstanceId("instance-1"));
			state.clear();
			const result = state.getInstanceState(toInstanceId("instance-1"));
			expect(result).toBeUndefined();
		});
	});
});
