import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EVENT_MANAGER } from "../../src/client/event-manager-client";

const MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE = {
	subscribe: jest.fn(),
	unsubscribe: jest.fn(),
	publishDirectMessage: jest.fn(),
	publish: jest.fn(),
};

jest.mock("../../src/client/message-manager-client", () => ({
	MessageManagerClient: jest
		.fn()
		.mockImplementation(() => MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE),
}));

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: Object.assign(
		jest.fn().mockImplementation(() => ({})),
		{ createWithTls: jest.fn(() => ({})) }
	),
}));

const MOCK_CREATE_CALLBACK_ROUTE = jest.fn();

jest.mock("../../src/http/messages.routes", () => ({
	CREATE_CALLBACK_ROUTE: jest.fn(() => MOCK_CREATE_CALLBACK_ROUTE),
}));

import BrokerMessage from "../../src/index";

describe("BrokerMessage", () => {
	let broker: any;

	const defaultParams: any = {
		tlsPaths: {
			caPath: "/path/to/ca.pem",
			certPath: "/path/to/cert.pem",
			keyPath: "/path/to/key.pem",
		},
		instanceId: "550e8400-e29b-41d4-a716-446655440000",
		addressManagerClient: { findService: jest.fn() },
		serviceName: "MessageDeliveryService",
	};

	beforeEach(() => {
		jest.clearAllMocks();
		EVENT_MANAGER.removeAllListeners?.();
		broker = new BrokerMessage(defaultParams);
	});

	describe("constructor", () => {
		it("should create instance with all params", () => {
			expect(broker).toBeInstanceOf(BrokerMessage);
		});

		it("should use default callbackPath when not provided", () => {
			const {
				MessageManagerClient,
			} = require("../../src/client/message-manager-client");
			expect(MessageManagerClient).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ callbackPath: "message" }),
				expect.any(Object)
			);
		});

		it("should use provided callbackPath", () => {
			const {
				MessageManagerClient,
			} = require("../../src/client/message-manager-client");
			jest.clearAllMocks();
			new BrokerMessage({ ...defaultParams, callbackPath: "/custom" } as any);
			expect(MessageManagerClient).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ callbackPath: "/custom" }),
				expect.any(Object)
			);
		});
	});

	describe("intents", () => {
		it("should call subscribe with topics", async () => {
			const topics = ["example.debug.create"];
			await broker.intents(topics);
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe
			).toHaveBeenCalledWith(topics);
		});
	});

	describe("stopMessageManager", () => {
		it("should call unsubscribe with topics", async () => {
			const topics = ["example.debug.create"];
			await broker.intents(topics);
			await broker.stopMessageManager();
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.unsubscribe
			).toHaveBeenCalledWith(topics);
		});

		it("should call kill functions from event array", async () => {
			const killFn = jest.fn();
			const _cleanup = EVENT_MANAGER.on("example.debug.create" as any, killFn);
			broker = new BrokerMessage(defaultParams);
			broker.on("example.debug.create", killFn);
			await broker.stopMessageManager();
		});

		it("should reset topics after stop", async () => {
			const topics = ["example.debug.create"];
			await broker.intents(topics);
			await broker.stopMessageManager();
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.unsubscribe
			).toHaveBeenCalledWith(topics);
		});
	});

	describe("on", () => {
		it("should register an event listener and trigger on emit", () => {
			const listener = jest.fn();
			broker.on("example.debug.create", listener);
			EVENT_MANAGER.emit("example.debug.create", { debug: true });
			expect(listener).toHaveBeenCalledWith({ debug: true });
		});

		it("should trigger listener when event is emitted", () => {
			const listener = jest.fn();
			broker.on("example.debug.create", listener);
			EVENT_MANAGER.emit("example.debug.create", { debug: true });
			expect(listener).toHaveBeenCalledWith({ debug: true });
		});
	});

	describe("listenExpress", () => {
		it("should call app.use with CreateCallbackRoute result", () => {
			const app = { use: jest.fn() };
			broker.listenExpress(app as any);
			expect(app.use).toHaveBeenCalledWith(MOCK_CREATE_CALLBACK_ROUTE);
		});
	});

	describe("post", () => {
		describe("direct", () => {
			it("should call publishDirectMessage", async () => {
				const metadata = {
					topic: "test",
					eventType: "test",
					publisher: {
						serviceName: "DiscoveryService",
						instanceId: "550e8400-e29b-41d4-a716-446655440000",
					},
				};
				await broker.post.direct(
					"MessageDeliveryService",
					{ data: "test" },
					metadata
				);
				expect(
					MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.publishDirectMessage
				).toHaveBeenCalledWith(
					"MessageDeliveryService",
					{ data: "test" },
					metadata
				);
			});
		});

		describe("indirect", () => {
			it("should call publish", async () => {
				const metadata = {
					topic: "test",
					eventType: "test",
					publisher: {
						serviceName: "DiscoveryService",
						instanceId: "550e8400-e29b-41d4-a716-446655440000",
					},
				};
				await broker.post.indirect({ data: "test" }, metadata);
				expect(
					MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.publish
				).toHaveBeenCalledWith({ data: "test" }, metadata);
			});
		});
	});

	describe("helper export", () => {
		it("should export MetadataBuilder", () => {
			const BrokerMessageModule = require("../../src/index");
			expect(BrokerMessageModule.HELPER.metadataBuilder).toBeDefined();
		});
	});
});
