import { describe, expect, it, jest } from "@jest/globals";
import { DefaultWsReconnector } from "../../../src/ws/default-ws-reconnector";

describe("DefaultWsReconnector", () => {
	it("should construct with default config", () => {
		const r = new DefaultWsReconnector({ onReconnect: jest.fn() });
		expect(r.shouldReconnect).toBe(true);
		expect(r.intentionalClose).toBe(false);
		expect(r.reconnectAttempt).toBe(0);
		expect(r.attempt).toBe(0);
		expect(r.permanentlyFellBack).toBe(false);
		expect(r.isDestroyed).toBe(false);
	});

	it("should not schedule reconnect when shouldReconnect is false", () => {
		const r = new DefaultWsReconnector({ onReconnect: jest.fn() });
		r.shouldReconnect = false;
		r.scheduleReconnect();
		expect(r.attempt).toBe(0);
	});

	it("should not schedule reconnect when maxAttempts reached", () => {
		const onPermanentFallback = jest.fn();
		const r = new DefaultWsReconnector({
			onReconnect: jest.fn(),
			maxAttempts: 1,
			onPermanentFallback,
		});
		r.scheduleReconnect();
		r.scheduleReconnect();
		expect(onPermanentFallback).toHaveBeenCalled();
	});

	it("should reset state", () => {
		const r = new DefaultWsReconnector({ onReconnect: jest.fn() });
		r.markIntentionalClose();
		expect(r.intentionalClose).toBe(true);
		r.reset();
		expect(r.intentionalClose).toBe(false);
	});

	it("should cancel and stop", () => {
		const r = new DefaultWsReconnector({ onReconnect: jest.fn() });
		r.cancel();
		r.stop();
	});

	it("should mark intentional close", () => {
		const r = new DefaultWsReconnector({ onReconnect: jest.fn() });
		r.markIntentionalClose();
		expect(r.intentionalClose).toBe(true);
	});
});
