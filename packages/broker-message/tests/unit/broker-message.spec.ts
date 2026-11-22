import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { EVENT_MANAGER } from "../../src/event-manager-client";

const MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE = {
	subscribe: jest.fn<(...args: any[]) => any>(),
	unsubscribe: jest.fn<(...args: any[]) => any>(),
	publish: jest.fn<(...args: any[]) => any>(),
};

jest.mock("../../src/message-manager-client", () => ({
	MessageManagerClient: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE),
}));

jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: Object.assign(
		jest.fn<(...args: any[]) => any>().mockImplementation(() => ({})),
		{ createWithTls: jest.fn((..._args: any[]) => ({})) }
	),
}));

import { SUBSCRIPTION_REFRESH_MS } from "../../src/broker-message";
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
			} = require("../../src/message-manager-client");
			expect(MessageManagerClient).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ callbackPath: "message" }),
				expect.any(Object)
			);
		});

		it("should use provided callbackPath", () => {
			const {
				MessageManagerClient,
			} = require("../../src/message-manager-client");
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
			const topics = ["training.model.published"];
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
				broker.intents(["training.model.published"])
			).resolves.toBeUndefined();
		});

		it("should renew the subscriptions periodically (message-manager keeps them in memory)", async () => {
			jest.useFakeTimers();
			await broker.intents(["training.model.published"]);
			MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe.mockClear();

			await jest.advanceTimersByTimeAsync(SUBSCRIPTION_REFRESH_MS * 2);

			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.subscribe
			).toHaveBeenCalledTimes(2);
		});
	});

	describe("stopMessageManager", () => {
		it("should call unsubscribe with topics", async () => {
			const topics = ["training.model.published"];
			await broker.intents(topics);
			await broker.stopMessageManager();
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.unsubscribe
			).toHaveBeenCalledWith(topics);
		});

		it("should reset topics after stop", async () => {
			const topics = ["training.model.published"];
			await broker.intents(topics);
			await broker.stopMessageManager();
			expect(
				MOCK_MESSAGE_MANAGER_CLIENT_INSTANCE.unsubscribe
			).toHaveBeenCalledWith(topics);
		});
	});

	describe("on", () => {
		it("should register an event listener that receives the payload and the metadata", async () => {
			const listener = jest.fn<(...args: any[]) => any>();
			const metadata = { topic: "training.model.published" };
			broker.on("training.model.published" as never, listener);
			await (EVENT_MANAGER as any).emit(
				"training.model.published",
				{ candle: [] },
				metadata
			);
			expect(listener).toHaveBeenCalledWith(
				{ candle: [] },
				metadata,
				undefined
			);
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
});
