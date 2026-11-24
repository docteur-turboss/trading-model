import { describe, expect, it, jest } from "@jest/globals";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	CircuitStateMachine,
	DEFAULT_CIRCUIT_CONFIG,
} from "@trading-model/reliability/circuit-state-machine";

describe("CircuitStateMachine", () => {
	it("should start closed", () => {
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		expect(csm.getState()).toBe(CircuitState.CLOSED);
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

	it("should reopen on a half-open failure with the default config", () => {
		jest.useFakeTimers();
		const csm = new CircuitStateMachine(DEFAULT_CIRCUIT_CONFIG);
		for (let i = 0; i < 5; i++) {
			csm.recordFailure();
		}
		jest.advanceTimersByTime(30_001);
		expect(csm.getState()).toBe(CircuitState.HALF_OPEN);
		csm.recordFailure();
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

	it("lets one half-open probe through until its result", () => {
		jest.useFakeTimers();
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 1000 as never,
		});
		csm.recordFailure();
		jest.advanceTimersByTime(1001);
		expect(csm.check()).toBe(CircuitState.HALF_OPEN);
		expect(csm.check()).toBe(CircuitState.OPEN);
		csm.recordFailure();
		expect(csm.check()).toBe(CircuitState.OPEN);
		jest.advanceTimersByTime(1001);
		expect(csm.check()).toBe(CircuitState.HALF_OPEN);
		csm.recordSuccess();
		expect(csm.check()).toBe(CircuitState.CLOSED);
		jest.useRealTimers();
	});

	it("frees the probe slot after the cooldown if no result arrives", () => {
		jest.useFakeTimers();
		const csm = new CircuitStateMachine({
			failureThreshold: 1,
			cooldownMs: 1000 as never,
		});
		csm.recordFailure();
		jest.advanceTimersByTime(1001);
		expect(csm.check()).toBe(CircuitState.HALF_OPEN);
		jest.advanceTimersByTime(1001);
		expect(csm.check()).toBe(CircuitState.HALF_OPEN);
		jest.useRealTimers();
	});
});
