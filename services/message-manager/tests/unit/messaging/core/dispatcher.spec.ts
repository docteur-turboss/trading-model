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
import { Dispatcher } from "../../../../src/messaging/core/dispatcher";
import { FileDlqRepository } from "../../../../src/messaging/core/dlq-repository";
import { Subscription } from "../../../../src/messaging/core/subscription";
import {
	createMockMessage,
	mockSubscribeParams,
	mockSubscriberIdentity,
} from "../../../fixtures/broker.fixture";
import { createMockHttpClient } from "../../../helpers/broker.helper";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ ip: string; port: number }>>()
		.mockResolvedValue({ ip: "10.0.0.1", port: 8444 }),
}));

describe("Dispatcher", () => {
	let mockHttpClient: ReturnType<typeof createMockHttpClient>;
	let dispatcher: Dispatcher;
	let dqlRepository: FileDlqRepository;
	const dlqFilePath = join(tmpdir(), `dlq-test-disp-${Date.now()}.jsonl`);

	beforeEach(() => {
		mockHttpClient = createMockHttpClient();
		dqlRepository = new FileDlqRepository(dlqFilePath);
		dispatcher = new Dispatcher(mockHttpClient as never, dqlRepository);
	});

	afterAll(async () => {
		if (existsSync(dlqFilePath)) {
			await unlink(dlqFilePath);
		}
	});

	describe("registerSubscription", () => {
		it("should register a new subscription for a topic", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalled();
		});

		it("should not register duplicate subscriptions for the same instance", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});

		it("should register subscriptions for different topics separately", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription({
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
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription({
				topic: "test.topic",
				callbackPath: "other/callback",
				consumerIdentity: {
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
			dispatcher.registerSubscription(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});

		it("should not dispatch to subscriptions of other topics", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);

			const message = createMockMessage("test", { topic: "other.topic" });
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).not.toHaveBeenCalled();
		});

		it("should not fail when a subscription dispatch throws", async () => {
			mockHttpClient.post.mockRejectedValueOnce(new Error("Delivery failed"));

			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription({
				...mockSubscribeParams,
				consumerIdentity: {
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

			dispatcher.registerSubscription(mockSubscribeParams);

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			const { logger } = jest.requireMock(
				"@trading-model/common/config/logger"
			) as {
				logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
			};
			expect(logger.error).toHaveBeenCalledWith("Message delivery failed", {
				context: { error: new Error("Unhandled error") },
			});

			jest.restoreAllMocks();
		});

		it("should deduplicate subscriptions by instanceId", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription({
				...mockSubscribeParams,
				callbackPath: "different/path",
				consumerIdentity: mockSubscriberIdentity,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});
	});

	describe("unregisterSubscription", () => {
		it("should remove a subscription from a topic", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.unregisterSubscription({
				topic: "test.topic",
				instanceId: mockSubscriberIdentity.instanceId,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).not.toHaveBeenCalled();
		});

		it("should do nothing when unregistering from a non-existent topic", () => {
			expect(() =>
				dispatcher.unregisterSubscription({
					topic: "nonexistent.topic",
					instanceId: "unknown",
				})
			).not.toThrow();
		});

		it("should keep other subscriptions when removing one instance", async () => {
			dispatcher.registerSubscription(mockSubscribeParams);
			dispatcher.registerSubscription({
				...mockSubscribeParams,
				consumerIdentity: {
					...mockSubscriberIdentity,
					instanceId: "subscriber-2",
				},
			});

			dispatcher.unregisterSubscription({
				topic: "test.topic",
				instanceId: mockSubscriberIdentity.instanceId,
			});

			const message = createMockMessage("test");
			await dispatcher.dispatch(message);

			expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
		});
	});
});
