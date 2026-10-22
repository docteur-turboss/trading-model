import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { HttpMessageDelivery } from "../../../../src/adapters/outbound/http-message-delivery";
import { Dispatcher } from "../../../../src/application/services/dispatcher";
import { Subscription } from "../../../../src/application/services/subscription";
import { FileDlqRepository } from "../../../../src/infrastructure/fallback/dlq-repository";
import {
	createMockMessage,
	mockSubscribeParams,
	mockSubscriberIdentity,
} from "../../../fixtures/broker.fixture";
import { createMockHttpClient } from "../../../helpers/broker.helper";

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => mockLogger,
}));

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ host: string; port: number }>>()
		.mockResolvedValue({ host: "10.0.0.1", port: 8444 }),
}));

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_PUBLISHED_TOTAL: { inc: jest.fn() },
	MESSAGES_DELIVERED_TOTAL: { inc: jest.fn() },
	MESSAGES_DLQ_TOTAL: { inc: jest.fn() },
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn() },
	DELIVERY_LATENCY_SECONDS: { observe: jest.fn() },
	SUBSCRIPTION_COUNT: { set: jest.fn() },
	CIRCUIT_BREAKER_STATE: { set: jest.fn() },
	IN_FLIGHT_MESSAGES: { inc: jest.fn(), dec: jest.fn() },
	SUBSCRIBER_DELIVERY_CONCURRENCY: { inc: jest.fn(), dec: jest.fn() },
}));

describe("Dispatcher", () => {
	let mockHttpClient: ReturnType<typeof createMockHttpClient>;
	let dispatcher: Dispatcher;
	let dqlRepository: FileDlqRepository;
	const dlqFilePath = join(tmpdir(), `dlq-test-disp-${Date.now()}.jsonl`);

	beforeEach(() => {
		mockHttpClient = createMockHttpClient();
		dqlRepository = new FileDlqRepository(dlqFilePath);
		dispatcher = new Dispatcher({
			deliveryPort: new HttpMessageDelivery(
				mockHttpClient as never,
				dqlRepository
			),
		});
		jest.clearAllMocks();
	});

	afterAll(async () => {
		if (existsSync(dlqFilePath)) {
			await unlink(dlqFilePath);
		}
	});

	describe("subscribe", () => {
		it("should register a new subscription for a topic", async () => {
			dispatcher.subscribe(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalled();
		});

		it("should not register duplicate subscriptions for the same instance", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});

		it("should register subscriptions for different topics separately", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe({
				...mockSubscribeParams,
				topic: "other.topic",
			});

			const message1 = createMockMessage("test", { topic: "test.topic" });
			const message2 = createMockMessage("test", { topic: "other.topic" });

			await dispatcher.dispatch(message1);
			await dispatcher.dispatch(message2);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
		});

		it("should register multiple instances for the same topic", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe({
				topic: "test.topic",
				callbackPath: "other/callback",
				serviceIdentity: {
					...mockSubscriberIdentity,
					instanceId: "subscriber-2",
				},
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
		});
	});

	describe("dispatch", () => {
		it("should do nothing when no subscriptions exist for the topic", async () => {
			const message = createMockMessage("test");

			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).not.toHaveBeenCalled();
		});

		it("should dispatch to all matching subscriptions", async () => {
			dispatcher.subscribe(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});

		it("should not dispatch to subscriptions of other topics", async () => {
			dispatcher.subscribe(mockSubscribeParams);

			const message = createMockMessage("test", { topic: "other.topic" });
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).not.toHaveBeenCalled();
		});

		it("should not fail when a subscription dispatch throws", async () => {
			mockHttpClient.post.mockRejectedValueOnce(new Error("Delivery failed"));

			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe({
				...mockSubscribeParams,
				serviceIdentity: {
					...mockSubscriberIdentity,
					instanceId: "subscriber-2",
				},
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
		});

		it("should log allSettled rejections when subscription.dispatch rejects", async () => {
			jest
				.spyOn(Subscription.prototype, "dispatch")
				.mockRejectedValue(new Error("Unhandled error"));

			dispatcher.subscribe(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockLogger.error).toHaveBeenCalledWith("Message delivery failed", {
				context: { error: new Error("Unhandled error") },
			});

			jest.restoreAllMocks();
		});

		it("should deduplicate subscriptions by instanceId", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe({
				...mockSubscribeParams,
				callbackPath: "different/path",
				serviceIdentity: mockSubscriberIdentity,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});
	});

	describe("unsubscribe", () => {
		it("should remove a subscription from a topic", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.unsubscribe({
				topic: "test.topic",
				instanceId: mockSubscriberIdentity.instanceId,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).not.toHaveBeenCalled();
		});

		it("should do nothing when unregistering from a non-existent topic", () => {
			expect(() =>
				dispatcher.unsubscribe({
					topic: "nonexistent.topic",
					instanceId: "unknown",
				})
			).not.toThrow();
		});

		it("should keep other subscriptions when removing one instance", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			dispatcher.subscribe({
				...mockSubscribeParams,
				serviceIdentity: {
					...mockSubscriberIdentity,
					instanceId: "subscriber-2",
				},
			});

			dispatcher.unsubscribe({
				topic: "test.topic",
				instanceId: mockSubscriberIdentity.instanceId,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});
	});

	describe("metrics", () => {
		it("should count published messages per topic", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			const { MESSAGES_PUBLISHED_TOTAL } = jest.requireMock<{
				MESSAGES_PUBLISHED_TOTAL: { inc: jest.Mock };
			}>("../../../../src/config/metrics");

			await dispatcher.publish("hello", {
				topic: "test.topic",
				eventType: "TestEvent",
				schemaVersion: "1.0.0",
				publisher: mockSubscriberIdentity,
			});

			expect(MESSAGES_PUBLISHED_TOTAL.inc).toHaveBeenCalledWith({
				topic: "test.topic",
			});
		});

		it("should track subscription count on subscribe and unsubscribe", () => {
			const { SUBSCRIPTION_COUNT } = jest.requireMock<{
				SUBSCRIPTION_COUNT: { set: jest.Mock };
			}>("../../../../src/config/metrics");

			dispatcher.subscribe(mockSubscribeParams);
			expect(SUBSCRIPTION_COUNT.set).toHaveBeenLastCalledWith(
				{ topic: "test.topic" },
				1
			);

			dispatcher.unsubscribe({
				topic: "test.topic",
				instanceId: mockSubscriberIdentity.instanceId,
			});
			expect(SUBSCRIPTION_COUNT.set).toHaveBeenLastCalledWith(
				{ topic: "test.topic" },
				0
			);
		});

		it("should track delivery latency and in-flight messages on dispatch", async () => {
			dispatcher.subscribe(mockSubscribeParams);
			const { DELIVERY_LATENCY_SECONDS, IN_FLIGHT_MESSAGES } =
				jest.requireMock<{
					DELIVERY_LATENCY_SECONDS: { observe: jest.Mock };
					IN_FLIGHT_MESSAGES: { inc: jest.Mock; dec: jest.Mock };
				}>("../../../../src/config/metrics");

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(IN_FLIGHT_MESSAGES.inc).toHaveBeenCalledTimes(1);
			expect(IN_FLIGHT_MESSAGES.dec).toHaveBeenCalledTimes(1);
			expect(DELIVERY_LATENCY_SECONDS.observe).toHaveBeenCalledWith(
				{ topic: "test.topic" },
				expect.any(Number)
			);
		});
	});
});
