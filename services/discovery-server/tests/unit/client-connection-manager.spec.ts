import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: (err: unknown) =>
		err instanceof Error ? err : new Error(String(err)),
}));

jest.mock("ws", () => {
	const mockWs = {
		OPEN: 1,
		CLOSED: 3,
		send: jest.fn(),
		close: jest.fn(),
		readyState: 1,
	};
	return {
		__esModule: true,
		default: mockWs,
	};
});

import WebSocket from "ws";
import {
	ClientConnectionManager,
	type ConnectedClient,
} from "../../src/core/client-connection-manager";

function makeClient(overrides?: Partial<ConnectedClient>): ConnectedClient {
	return {
		ws: Object.assign(Object.create(WebSocket), {
			send: jest.fn(),
			close: jest.fn(),
			readyState: (WebSocket as any).OPEN,
		}),
		subscribedServices: new Set(["test-service"]),
		...overrides,
	};
}

describe("ClientConnectionManager", () => {
	let manager: ClientConnectionManager;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		manager = new ClientConnectionManager();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("add", () => {
		it("should add a client and set a timeout", () => {
			const client = makeClient();
			manager.add("client-1", client);
			expect(manager.get("client-1")).toBe(client);
		});
	});

	describe("remove", () => {
		it("should remove an existing client", () => {
			const client = makeClient();
			manager.add("client-1", client);
			manager.remove("client-1");
			expect(manager.get("client-1")).toBeUndefined();
		});

		it("should be safe to remove a non-existent client", () => {
			expect(() => manager.remove("non-existent")).not.toThrow();
		});
	});

	describe("get", () => {
		it("should return undefined for unknown client", () => {
			expect(manager.get("unknown")).toBeUndefined();
		});

		it("should return the client after add", () => {
			const client = makeClient();
			manager.add("client-1", client);
			expect(manager.get("client-1")).toBe(client);
		});
	});

	describe("[Symbol.iterator]", () => {
		it("should iterate over all clients", () => {
			const client1 = makeClient();
			const client2 = makeClient();
			manager.add("c1", client1);
			manager.add("c2", client2);

			const entries = Array.from(manager);
			expect(entries).toHaveLength(2);
			expect(entries).toContainEqual(["c1", client1]);
			expect(entries).toContainEqual(["c2", client2]);
		});

		it("should yield nothing when empty", () => {
			const entries = Array.from(manager);
			expect(entries).toHaveLength(0);
		});
	});

	describe("isSubscribed", () => {
		it("should return true if client subscribed to specific service", () => {
			const client = makeClient({ subscribedServices: new Set(["my-svc"]) });
			expect(manager.isSubscribed(client, "my-svc")).toBe(true);
		});

		it("should return true if client subscribed to wildcard", () => {
			const client = makeClient({ subscribedServices: new Set(["*"]) });
			expect(manager.isSubscribed(client, "any-service")).toBe(true);
		});

		it("should return false if client not subscribed", () => {
			const client = makeClient({ subscribedServices: new Set(["other"]) });
			expect(manager.isSubscribed(client, "my-svc")).toBe(false);
		});
	});

	describe("sendToClient", () => {
		it("should send message when ws is OPEN", () => {
			const ws = {
				readyState: (WebSocket as any).OPEN,
				send: jest.fn(),
				close: jest.fn(),
			};
			const client = makeClient({ ws: ws as any });
			manager.sendToClient("client-1", client, "hello");
			expect(ws.send).toHaveBeenCalledWith("hello");
		});

		it("should not send when ws is not OPEN", () => {
			const ws = {
				readyState: (WebSocket as any).CLOSED,
				send: jest.fn(),
				close: jest.fn(),
			};
			const client = makeClient({ ws: ws as any });
			manager.sendToClient("client-1", client, "hello");
			expect(ws.send).not.toHaveBeenCalled();
		});

		it("should log warn on send error", () => {
			const ws = {
				readyState: (WebSocket as any).OPEN,
				send: jest.fn(() => {
					throw new Error("send failed");
				}),
				close: jest.fn(),
			};
			const client = makeClient({ ws: ws as any });
			manager.sendToClient("client-1", client, "hello");

			const { logger } = jest.requireMock<{
				logger: { warn: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to send message to client",
				expect.objectContaining({ clientId: "client-1" })
			);
		});
	});

	describe("broadcast", () => {
		it("should send message to all subscribed clients", () => {
			const ws1 = {
				readyState: (WebSocket as any).OPEN,
				send: jest.fn(),
				close: jest.fn(),
			};
			const ws2 = {
				readyState: (WebSocket as any).OPEN,
				send: jest.fn(),
				close: jest.fn(),
			};
			const client1 = makeClient({
				ws: ws1 as any,
				subscribedServices: new Set(["svc-a"]),
			});
			const client2 = makeClient({
				ws: ws2 as any,
				subscribedServices: new Set(["svc-b"]),
			});
			const client3 = makeClient({
				ws: {
					readyState: (WebSocket as any).OPEN,
					send: jest.fn(),
					close: jest.fn(),
				} as any,
				subscribedServices: new Set(["svc-a"]),
			});

			manager.add("c1", client1);
			manager.add("c2", client2);
			manager.add("c3", client3);

			manager.broadcast("svc-a", "update");

			expect(ws1.send).toHaveBeenCalledWith("update");
			expect(ws2.send).not.toHaveBeenCalled();
		});
	});

	describe("resetTimeout", () => {
		it("should clear previous timeout and set a new one", () => {
			const ws = {
				readyState: (WebSocket as any).OPEN,
				send: jest.fn(),
				close: jest.fn(),
			};
			const client = makeClient({ ws: ws as any });
			manager.add("client-1", client);

			const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
			const setTimeoutSpy = jest.spyOn(global, "setTimeout");

			manager.resetTimeout("client-1", ws as any);

			expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
			expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

			clearTimeoutSpy.mockRestore();
			setTimeoutSpy.mockRestore();
		});
	});

	describe("clearAll", () => {
		it("should close all clients and clear maps", () => {
			const ws1 = { close: jest.fn(), readyState: 1, send: jest.fn() };
			const ws2 = { close: jest.fn(), readyState: 1, send: jest.fn() };
			manager.add("c1", makeClient({ ws: ws1 as any }));
			manager.add("c2", makeClient({ ws: ws2 as any }));

			manager.clearAll();

			expect(ws1.close).toHaveBeenCalled();
			expect(ws2.close).toHaveBeenCalled();
			expect(Array.from(manager)).toHaveLength(0);
		});
	});
});
