import { describe, expect, it, jest } from "@jest/globals";
import {
	BaseWsConnection,
	type WsConnectionHooks,
} from "../../../src/ws/base-ws-connection";

jest.mock("ws", () => ({
	__esModule: true,
	default: { OPEN: 1 },
}));

interface FakeSocket {
	readyState: number;
	on(event: string, cb: (...args: unknown[]) => void): this;
	emit(event: string, ...args: unknown[]): void;
	removeAllListeners(): void;
	close(code?: number, reason?: string): void;
	send(data: unknown): void;
}

function makeSocket(): FakeSocket {
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	return {
		readyState: 0,
		on(event, cb) {
			if (!listeners.has(event)) {
				listeners.set(event, new Set());
			}
			listeners.get(event)!.add(cb);
			return this;
		},
		emit(event, ...args) {
			const handlers = listeners.get(event);
			if (handlers) {
				for (const cb of handlers) {
					cb(...args);
				}
			}
		},
		removeAllListeners() {
			listeners.clear();
		},
		close() {},
		send() {},
	};
}

class TestConnection extends BaseWsConnection {
	connect(): void {}

	public attach(ws: FakeSocket, hooks?: WsConnectionHooks): void {
		this.attachHandlers(ws as never, hooks);
	}
}

describe("BaseWsConnection", () => {
	it("should expose the underlying ws after attaching", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		expect(conn.ws).toBeNull();
		conn.attach(ws);
		expect(conn.ws).toBe(ws);
	});

	it("should fire onOpen hooks on open", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const hookOpen = jest.fn();
		const ownOpen = jest.fn();
		conn.onOpen = ownOpen;
		conn.attach(ws, { onOpen: hookOpen });
		ws.emit("open");
		expect(hookOpen).toHaveBeenCalledTimes(1);
		expect(ownOpen).toHaveBeenCalledTimes(1);
	});

	it("should route messages to hooks when provided", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const hookMessage = jest.fn();
		const ownMessage = jest.fn();
		conn.onMessage = ownMessage;
		conn.attach(ws, { onMessage: hookMessage });
		ws.emit("message", Buffer.from("hello"));
		expect(hookMessage).toHaveBeenCalledWith(Buffer.from("hello"));
		expect(ownMessage).not.toHaveBeenCalled();
	});

	it("should route messages to the default handler otherwise", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const ownMessage = jest.fn();
		conn.onMessage = ownMessage;
		conn.attach(ws);
		ws.emit("message", Buffer.from("hello"));
		expect(ownMessage).toHaveBeenCalledWith(Buffer.from("hello"));
	});

	it("should fire onClose hooks on close", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const hookClose = jest.fn();
		const ownClose = jest.fn();
		conn.onCloseHandler = ownClose;
		conn.attach(ws, { onClose: hookClose });
		ws.emit("close", 1000);
		expect(hookClose).toHaveBeenCalledWith(1000);
		expect(ownClose).toHaveBeenCalledWith(1000);
	});

	it("should fire onError hooks on error", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const hookError = jest.fn();
		const ownError = jest.fn();
		const err = new Error("boom");
		conn.onError = ownError;
		conn.attach(ws, { onError: hookError });
		ws.emit("error", err);
		expect(hookError).toHaveBeenCalledWith(err);
		expect(ownError).toHaveBeenCalledWith(err);
	});

	it("should disconnect by clearing listeners and closing", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		const removeAllListeners = jest.spyOn(ws, "removeAllListeners");
		const close = jest.spyOn(ws, "close");
		conn.attach(ws);
		conn.disconnect(1000, "done");
		expect(removeAllListeners).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledWith(1000, "done");
	});

	it("should not throw when disconnecting without a socket", () => {
		const conn = new TestConnection();
		expect(() => conn.disconnect()).not.toThrow();
	});

	it("should report send failure when socket is not open", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		ws.readyState = 0;
		conn.attach(ws);
		expect(conn.send("data")).toBe(false);
	});

	it("should send strings when socket is open", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		ws.readyState = 1;
		const send = jest.spyOn(ws, "send");
		conn.attach(ws);
		expect(conn.send("hello")).toBe(true);
		expect(send).toHaveBeenCalledWith("hello");
	});

	it("should serialize non-string data", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		ws.readyState = 1;
		const send = jest.spyOn(ws, "send");
		conn.attach(ws);
		expect(conn.send({ a: 1 })).toBe(true);
		expect(send).toHaveBeenCalledWith(JSON.stringify({ a: 1 }));
	});

	it("should return false when send throws", () => {
		const conn = new TestConnection();
		const ws = makeSocket();
		ws.readyState = 1;
		jest.spyOn(ws, "send").mockImplementation(() => {
			throw new Error("send failed");
		});
		conn.attach(ws);
		expect(conn.send("hello")).toBe(false);
	});

	it("should report connection state", () => {
		const conn = new TestConnection();
		expect(conn.isConnected).toBe(false);
		const ws = makeSocket();
		ws.readyState = 1;
		conn.attach(ws);
		expect(conn.isConnected).toBe(true);
		ws.readyState = 0;
		expect(conn.isConnected).toBe(false);
	});
});
