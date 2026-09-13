import { describe, expect, it, jest } from "@jest/globals";
import { createWsConnectTimeout } from "../../../src/utils/ws-reconnect";

describe("createWsConnectTimeout", () => {
	it("should invoke the callback after the default timeout", () => {
		jest.useFakeTimers();
		const onTimeout = jest.fn();
		createWsConnectTimeout(onTimeout);
		expect(onTimeout).not.toHaveBeenCalled();
		jest.advanceTimersByTime(10_000);
		expect(onTimeout).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});

	it("should use a custom timeout", () => {
		jest.useFakeTimers();
		const onTimeout = jest.fn();
		createWsConnectTimeout(onTimeout, 500);
		jest.advanceTimersByTime(499);
		expect(onTimeout).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		expect(onTimeout).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});

	it("should cancel the timer when cleanup is called", () => {
		jest.useFakeTimers();
		const onTimeout = jest.fn();
		const cleanup = createWsConnectTimeout(onTimeout, 500);
		cleanup();
		jest.advanceTimersByTime(10_000);
		expect(onTimeout).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});
