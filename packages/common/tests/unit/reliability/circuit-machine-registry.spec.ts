import { describe, expect, it, jest } from "@jest/globals";
import { CircuitState } from "../../../src/domain/circuit-state";
import { DurationMs } from "../../../src/domain/primitives";
import { CircuitMachineRegistry } from "../../../src/reliability/circuit-machine-registry";

describe("CircuitMachineRegistry", () => {
	it("should create and reuse machines per key", () => {
		const registry = new CircuitMachineRegistry({
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		});
		const a = registry.getMachine("a");
		expect(registry.getMachine("a")).toBe(a);
		expect(registry.getMachine("b")).not.toBe(a);
	});

	it("should iterate over all machines", () => {
		const registry = new CircuitMachineRegistry({
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
		const registry = new CircuitMachineRegistry({
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
		const registry = new CircuitMachineRegistry({
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
		const registry = new CircuitMachineRegistry({
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
