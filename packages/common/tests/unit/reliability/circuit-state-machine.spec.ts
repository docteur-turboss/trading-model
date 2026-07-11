import { describe, expect, it, jest } from "@jest/globals";
import { CircuitState } from "../../../src/domain/circuit-state";
import {
	CircuitStateMachine,
	DEFAULT_CIRCUIT_CONFIG,
} from "../../../src/reliability/circuit-state-machine";

describe("CircuitStateMachine", () => {
	it("should start closed", () => {
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		expect(csm.getState()).toBe(CircuitState.CLOSED);
		expect(csm.isAllowed()).toBe(true);
		expect(csm.check()).toBe(CircuitState.CLOSED);
	});

	it("should open after failure threshold", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 3,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		expect(csm.getState()).toBe(CircuitState.CLOSED);
		csm.recordFailure();
		expect(csm.getState()).toBe(CircuitState.CLOSED);
		csm.recordFailure();
		expect(csm.getState()).toBe(CircuitState.OPEN);
	});

	it("should close on success", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 2,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		csm.recordFailure();
		expect(csm.getState()).toBe(CircuitState.OPEN);
		csm.recordSuccess();
		expect(csm.getState()).toBe(CircuitState.CLOSED);
	});

	it("should transition to half-open after cooldown", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: -1 as never,
		});
		csm.recordFailure();
		expect(csm.getState(Date.now() + 1000)).toBe(CircuitState.HALF_OPEN);
	});

	it("should reopen after halfOpenMaxAttempts", () => {
		jest.useFakeTimers();
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 60000 as never,
			halfOpenMaxAttempts: 2,
		});
		csm.recordFailure();
		expect(csm.getState()).toBe(CircuitState.OPEN);
		jest.advanceTimersByTime(60001);
		expect(csm.getState()).toBe(CircuitState.HALF_OPEN);
		csm.recordFailure(1, undefined);
		expect(csm.getState()).toBe(CircuitState.HALF_OPEN);
		csm.recordFailure(1, undefined);
		expect(csm.getState()).toBe(CircuitState.OPEN);
		jest.useRealTimers();
	});

	it("should handle isOpen half-open to closed transition", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		const future = Date.now() + 100000;
		expect(csm.isOpen(future)).toBe(false);
		expect(csm.getState(future)).toBe(CircuitState.CLOSED);
	});

	it("should reset on clear", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		csm.clear();
		expect(csm.getState()).toBe(CircuitState.CLOSED);
		expect(csm.failures).toBe(0);
	});

	it("should snapshot and restore state", () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 5,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		csm.recordFailure();
		const snapshot = csm.snapshot();
		expect(snapshot.failures).toBe(2);

		const csm2 = new CircuitStateMachine({
			failureThreshold: 5,
			cooldownMs: 60000 as never,
		});
		csm2.restore(snapshot);
		expect(csm2.failures).toBe(2);
	});

	it("should execute call successfully", async () => {
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		const result = await csm.call(async () => "success");
		expect(result).toBe("success");
	});

	it("should use fallback when circuit open", async () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		const result = await csm.call(
			async () => "should not run",
			() => "fallback"
		);
		expect(result).toBe("fallback");
	});

	it("should throw when circuit open without fallback", async () => {
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 60000 as never,
		});
		csm.recordFailure();
		await expect(csm.call(async () => "should not run")).rejects.toThrow();
	});

	it("should use fallback on function failure", async () => {
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		const result = await csm.call(
			async () => {
				throw new Error("fail");
			},
			() => "fallback"
		);
		expect(result).toBe("fallback");
	});

	it("should rethrow on function failure without fallback", async () => {
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		await expect(
			csm.call(async () => {
				throw new Error("fail");
			})
		).rejects.toThrow("fail");
	});
});
