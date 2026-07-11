import { describe, expect, it } from "@jest/globals";
import { WebSocket } from "ws";
import {
	isWsConnected,
	requireWsConnected,
} from "../../../src/domain/ws-connection";

describe("isWsConnected", () => {
	it("should return false for null", () => {
		expect(isWsConnected(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isWsConnected(undefined)).toBe(false);
	});

	it("should return false when readyState is not OPEN", () => {
		const ws = { readyState: WebSocket.CONNECTING } as WebSocket;
		expect(isWsConnected(ws)).toBe(false);
	});

	it("should return false for CLOSING state", () => {
		const ws = { readyState: WebSocket.CLOSING } as WebSocket;
		expect(isWsConnected(ws)).toBe(false);
	});

	it("should return false for CLOSED state", () => {
		const ws = { readyState: WebSocket.CLOSED } as WebSocket;
		expect(isWsConnected(ws)).toBe(false);
	});

	it("should return true when readyState is OPEN", () => {
		const ws = { readyState: WebSocket.OPEN } as WebSocket;
		expect(isWsConnected(ws)).toBe(true);
	});

	it("should narrow the type when true is returned", () => {
		const ws: WebSocket | null = { readyState: WebSocket.OPEN } as WebSocket;
		if (isWsConnected(ws)) {
			expect(ws.readyState).toBe(WebSocket.OPEN);
		} else {
			throw new Error("Expected type guard to pass");
		}
	});
});

describe("requireWsConnected", () => {
	it("should throw when ws is null", () => {
		expect(() => requireWsConnected(null)).toThrow(
			"WebSocket is not connected"
		);
	});

	it("should throw when ws is undefined", () => {
		expect(() => requireWsConnected(undefined)).toThrow(
			"WebSocket is not connected"
		);
	});

	it("should throw when ws is not OPEN", () => {
		const ws = { readyState: WebSocket.CONNECTING } as WebSocket;
		expect(() => requireWsConnected(ws)).toThrow("WebSocket is not connected");
	});

	it("should not throw when ws is connected", () => {
		const ws = { readyState: WebSocket.OPEN } as WebSocket;
		expect(() => requireWsConnected(ws)).not.toThrow();
	});

	it("should narrow the type after assertion (no TS error)", () => {
		const ws: WebSocket | null = { readyState: WebSocket.OPEN } as WebSocket;
		requireWsConnected(ws);
		expect(ws.readyState).toBe(WebSocket.OPEN);
	});
});
