import { describe, expect, it, jest } from "@jest/globals";
import {
	createWsConnectTimeout,
	scheduleWsReconnect,
} from "../../../src/utils/ws-reconnect";

describe("scheduleWsReconnect", () => {
	it("should not schedule when destroyed", () => {
		const state = { attempt: 0, timer: null, destroyed: true };
		scheduleWsReconnect({
			state,
			config: { baseDelayMs: 100, maxDelayMs: 1000 },
			onReconnect: jest.fn(),
			logger: { info: jest.fn(), warn: jest.fn() },
		});
		expect(state.timer).toBeNull();
	});

	it("should not schedule when max attempts reached", () => {
		const state = { attempt: 3, timer: null, destroyed: false };
		scheduleWsReconnect({
			state,
			config: { baseDelayMs: 100, maxDelayMs: 1000, maxAttempts: 3 },
			onReconnect: jest.fn(),
			logger: { info: jest.fn(), warn: jest.fn() },
		});
		expect(state.timer).toBeNull();
	});

	it("should schedule a reconnect timer", () => {
		jest.useFakeTimers();
		const state = { attempt: 0, timer: null, destroyed: false };
		const onReconnect = jest.fn();
		scheduleWsReconnect({
			state,
			config: { baseDelayMs: 100, maxDelayMs: 1000 },
			onReconnect,
			logger: { info: jest.fn(), warn: jest.fn() },
		});
		expect(state.timer).not.toBeNull();
		expect(state.attempt).toBe(1);
		jest.runAllTimers();
		expect(onReconnect).toHaveBeenCalled();
		jest.useRealTimers();
	});
});

describe("createWsConnectTimeout", () => {
	it("should create a cancelable timeout", () => {
		jest.useFakeTimers();
		const onTimeout = jest.fn();
		const cancel = createWsConnectTimeout(onTimeout, 5000 as never);
		cancel();
		jest.runAllTimers();
		expect(onTimeout).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});
