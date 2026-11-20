import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
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
});
