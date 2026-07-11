import { describe, expect, it } from "@jest/globals";
import { ActiveReplayCounter } from "../../src/dlq/shared/active-replay-counter";

describe("ActiveReplayCounter", () => {
	it("should start at 0", () => {
		const counter = new ActiveReplayCounter();
		expect(counter.count).toBe(0);
	});

	it("should increment count", () => {
		const counter = new ActiveReplayCounter();
		counter.increment();
		expect(counter.count).toBe(1);
		counter.increment();
		expect(counter.count).toBe(2);
	});

	it("should decrement count", () => {
		const counter = new ActiveReplayCounter();
		counter.increment();
		counter.increment();
		counter.decrement();
		expect(counter.count).toBe(1);
	});

	it("should not decrement below 0", () => {
		const counter = new ActiveReplayCounter();
		counter.decrement();
		expect(counter.count).toBe(0);
	});

	it("activeReplays singleton should work", () => {
		const mod = jest.requireActual(
			"../../src/dlq/shared/active-replay-counter"
		) as {
			ActiveReplayCounter: typeof ActiveReplayCounter;
			activeReplays: ActiveReplayCounter;
		};
		expect(mod.activeReplays).toBeInstanceOf(ActiveReplayCounter);
	});
});
