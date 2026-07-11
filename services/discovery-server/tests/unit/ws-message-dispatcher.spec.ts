import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

import { DiscoveryWsMessageType } from "@trading-model/common/contracts/discovery-ws-message.types";
import type WebSocket from "ws";
import type { ConnectedClient } from "../../src/core/client-connection-manager";
import { WsMessageDispatcher } from "../../src/core/ws-message-dispatcher";

function createMockClient(
	overrides?: Partial<ConnectedClient>
): ConnectedClient {
	return {
		ws: { readyState: 1, send: jest.fn() } as unknown as WebSocket,
		subscribedServices: new Set<string>(),
		instanceId: undefined,
		serviceName: undefined,
		...overrides,
	};
}

describe("WsMessageDispatcher", () => {
	let dispatcher: WsMessageDispatcher;
	let client: ConnectedClient;
	const clientId = "test-client-1";

	beforeEach(() => {
		jest.clearAllMocks();
		dispatcher = new WsMessageDispatcher();
		client = createMockClient();
	});

	describe("handleMessage", () => {
		it("should handle a valid subscribe message", () => {
			const message = JSON.stringify({
				type: DiscoveryWsMessageType.Subscribe,
				payload: { services: ["financial-scraper-service"] },
			});

			dispatcher.handleMessage(clientId, client, message as never);

			expect(client.subscribedServices.has("financial-scraper-service")).toBe(
				true
			);
		});

		it("should handle a subscribe message with no services (subscribe all)", () => {
			const message = JSON.stringify({
				type: DiscoveryWsMessageType.Subscribe,
				payload: {},
			});

			dispatcher.handleMessage(clientId, client, message as never);

			expect(client.subscribedServices.has("*")).toBe(true);
		});

		it("should handle a subscribe message with invalid services (non-array fallback to all)", () => {
			const message = JSON.stringify({
				type: DiscoveryWsMessageType.Subscribe,
				payload: { services: "not-an-array" },
			});

			dispatcher.handleMessage(clientId, client, message as never);

			expect(client.subscribedServices.has("*")).toBe(true);
		});

		it("should handle a valid heartbeat message with serviceName", () => {
			const message = JSON.stringify({
				type: DiscoveryWsMessageType.Heartbeat,
				payload: { serviceName: "test-service", instanceId: "test-instance" },
			});

			dispatcher.handleMessage(clientId, client, message as never);

			expect(client.serviceName).toBe("test-service");
			expect(client.instanceId).toBe("test-instance");
		});

		it("should handle a heartbeat message without payload", () => {
			const message = JSON.stringify({
				type: DiscoveryWsMessageType.Heartbeat,
			});

			dispatcher.handleMessage(clientId, client, message as never);

			expect(client.serviceName).toBeUndefined();
			expect(client.instanceId).toBeUndefined();
		});

		it("should log a warning for unparseable messages", () => {
			const { logger } = jest.requireMock(
				"@trading-model/common/config/logger"
			) as { logger: { warn: jest.Mock } };

			dispatcher.handleMessage(clientId, client, "not-json" as never);

			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to parse WS message",
				expect.objectContaining({ clientId })
			);
		});

		it("should handle an unknown message type without error", () => {
			const message = JSON.stringify({
				type: "UnknownType",
				payload: {},
			});

			expect(() => {
				dispatcher.handleMessage(clientId, client, message as never);
			}).not.toThrow();
		});
	});
});
