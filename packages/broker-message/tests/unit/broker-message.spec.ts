import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { EVENT_MANAGER } from "../../src/application/services/event-manager-client";

const MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE = {
	subscribe: jest.fn<(...args: any[]) => any>(),
	unsubscribe: jest.fn<(...args: any[]) => any>(),
	publish: jest.fn<(...args: any[]) => any>(),
};

jest.mock("../../src/adapters/outbound/message-manager-client", () => ({
	MessageManagerClient: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE),
}));

jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: Object.assign(
		jest.fn<(...args: any[]) => any>().mockImplementation(() => ({})),
		{ createWithTls: jest.fn((..._args: any[]) => ({})) }
	),
}));

const MOCK_CREATE_CALLBACK_ROUTE = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/inbound/messages.routes", () => ({
	CREATE_CALLBACK_ROUTE: jest.fn(
		(..._args: any[]) => MOCK_CREATE_CALLBACK_ROUTE
	),
}));

import { SUBSCRIPTION_REFRESH_MS } from "../../src/application/services/broker-message";
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
		addressManagerClient: { findService: jest.fn<(...args: any[]) => any>() },
		serviceName: "MessageDeliveryService",
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(EVENT_MANAGER as any)._emitter.removeAllListeners();
		broker = new BrokerMessage(defaultParams);
	});

	describe("constructor", () => {
		it("should create instance with all params", () => {
			expect(broker).toBeInstanceOf(BrokerMessage);
		});

		it("should use default callbackPath when not provided", () => {
			const {
				MessageManagerClient,
			} = require("../../src/adapters/outbound/message-manager-client");
			expect(MessageManagerClient).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ callbackPath: "message" }),
				expect.any(Object)
			);
		});

		it("should use provided callbackPath", () => {
			const {
				MessageManagerClient,
			} = require("../../src/adapters/outbound/message-manager-client");
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
		afterEach(async () => {
			await broker.stopMessageManager();
			jest.useRealTimers();
		});

		it("should call subscribe with topics", async () => {
			const topics = ["example.debug.create"];
			await broker.intents(topics);
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe
			).toHaveBeenCalledWith(topics);
		});

		it("should not reject when the first subscription fails", async () => {
			MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe.mockRejectedValueOnce(
				new Error("message-manager unreachable") as never
			);
			await expect(
				broker.intents(["example.debug.create"])
			).resolves.toBeUndefined();
		});

		it("should renew the subscriptions periodically (message-manager keeps them in memory)", async () => {
			jest.useFakeTimers();
			await broker.intents(["example.debug.create"]);
			MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe.mockClear();

			await jest.advanceTimersByTimeAsync(SUBSCRIPTION_REFRESH_MS * 2);

			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe
			).toHaveBeenCalledTimes(2);
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
			const killFn = jest.fn<(...args: any[]) => any>();
			EVENT_MANAGER.on("example.debug.create" as never as any, killFn);
			broker = new BrokerMessage(defaultParams);
			broker.on("example.debug.create" as never, killFn);
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
			const listener = jest.fn<(...args: any[]) => any>();
			broker.on("example.debug.create" as never, listener);
			(EVENT_MANAGER as any).emit("example.debug.create", { debug: true });
			expect(listener).toHaveBeenCalledWith({ debug: true });
		});

		it("should trigger listener when event is emitted", () => {
			const listener = jest.fn<(...args: any[]) => any>();
			broker.on("example.debug.create" as never, listener);
			(EVENT_MANAGER as any).emit("example.debug.create", { debug: true });
			expect(listener).toHaveBeenCalledWith({ debug: true });
		});
	});

	describe("listenExpress", () => {
		it("should call app.use with CreateCallbackRoute result", () => {
			const app = { use: jest.fn<(...args: any[]) => any>() };
			broker.listenExpress(app as any);
			expect(app.use).toHaveBeenCalledWith(MOCK_CREATE_CALLBACK_ROUTE);
		});
	});

	describe("post", () => {
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
