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
import { Dispatcher } from "../../src/messaging/core/dispatcher";
import { FileDlqRepository } from "../../src/messaging/core/dlq-repository";
import {
	mockServiceIdentity,
	mockSubscriberIdentity,
} from "../fixtures/broker.fixture";
import { createMockHttpClient } from "../helpers/broker.helper";

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ host: string; port: number }>>()
		.mockResolvedValue({ host: "10.0.0.1", port: 8444 }),
}));

describe("Message Broker Integration", () => {
	let httpClient: ReturnType<typeof createMockHttpClient>;
	let dispatcher: Dispatcher;
	const dlqFilePath = join(tmpdir(), `dlq-test-int-${Date.now()}.jsonl`);

	beforeEach(() => {
		httpClient = createMockHttpClient();
		const dqlRepository = new FileDlqRepository(dlqFilePath);
		dispatcher = new Dispatcher(httpClient as never, dqlRepository);
	});

	afterAll(async () => {
		if (existsSync(dlqFilePath)) {
			await unlink(dlqFilePath);
		}
	});

	it("should deliver a published message to a subscribed service", async () => {
		httpClient.post.mockResolvedValue(undefined);

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "message/receive",
			serviceIdentity: mockSubscriberIdentity,
		});

		await dispatcher.publish(
			{ price: 50000, symbol: "BTCUSDT" },
			{
				schemaVersion: "1.0",
				eventType: "PriceUpdate",
				topic: "market.data",
				publisher: mockServiceIdentity,
			}
		);

		expect(httpClient.post).toHaveBeenCalledTimes(1);

		const [targetUrl, body] = httpClient.post.mock.calls[0] as [
			string,
			{ message: { payload: { price: number; symbol: string } } },
		];

		expect(targetUrl).toContain("10.0.0.1");
		expect(targetUrl).toContain("8444");
		expect(targetUrl).toContain("message/receive");
		expect(body.message.payload).toEqual({ price: 50000, symbol: "BTCUSDT" });
	});

	it("should deliver to multiple subscribers of the same topic", async () => {
		httpClient.post.mockResolvedValue(undefined);

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "msg/recv",
			serviceIdentity: { ...mockSubscriberIdentity, instanceId: "sub-1" },
		});

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "msg/recv",
			serviceIdentity: { ...mockSubscriberIdentity, instanceId: "sub-2" },
		});

		await dispatcher.publish(
			{ price: 50000 },
			{
				schemaVersion: "1.0",
				eventType: "PriceUpdate",
				topic: "market.data",
				publisher: mockServiceIdentity,
			}
		);

		expect(httpClient.post).toHaveBeenCalledTimes(2);
	});

	it("should not deliver to unsubscribed services", async () => {
		httpClient.post.mockResolvedValue(undefined);

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "msg/recv",
			serviceIdentity: mockSubscriberIdentity,
		});

		dispatcher.unsubscribe({
			topic: "market.data",
			instanceId: mockSubscriberIdentity.instanceId,
		});

		await dispatcher.publish(
			{ price: 50000 },
			{
				schemaVersion: "1.0",
				eventType: "PriceUpdate",
				topic: "market.data",
				publisher: mockServiceIdentity,
			}
		);

		expect(httpClient.post).not.toHaveBeenCalled();
	});

	it("should not deliver to services subscribed to a different topic", async () => {
		httpClient.post.mockResolvedValue(undefined);

		dispatcher.subscribe({
			topic: "other.topic",
			callbackPath: "msg/recv",
			serviceIdentity: mockSubscriberIdentity,
		});

		await dispatcher.publish(
			{ price: 50000 },
			{
				schemaVersion: "1.0",
				eventType: "PriceUpdate",
				topic: "market.data",
				publisher: mockServiceIdentity,
			}
		);

		expect(httpClient.post).not.toHaveBeenCalled();
	});

	it("should survive a subscriber failure and still deliver to other subscribers", async () => {
		httpClient.post
			.mockRejectedValueOnce(new Error("Subscriber 1 failed"))
			.mockResolvedValueOnce(undefined);

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "msg/recv",
			serviceIdentity: { ...mockSubscriberIdentity, instanceId: "sub-1" },
		});

		dispatcher.subscribe({
			topic: "market.data",
			callbackPath: "msg/recv",
			serviceIdentity: { ...mockSubscriberIdentity, instanceId: "sub-2" },
		});

		await dispatcher.publish(
			{ price: 50000 },
			{
				schemaVersion: "1.0",
				eventType: "PriceUpdate",
				topic: "market.data",
				publisher: mockServiceIdentity,
			}
		);

		expect(httpClient.post).toHaveBeenCalledTimes(3);
	});

	it("should generate unique message IDs for each publish", async () => {
		httpClient.post.mockResolvedValue(undefined);

		dispatcher.subscribe({
			topic: "test",
			callbackPath: "msg",
			serviceIdentity: mockSubscriberIdentity,
		});

		await dispatcher.publish(
			{ data: 1 },
			{
				schemaVersion: "1.0",
				eventType: "Event",
				topic: "test",
				publisher: mockServiceIdentity,
			}
		);

		await dispatcher.publish(
			{ data: 2 },
			{
				schemaVersion: "1.0",
				eventType: "Event",
				topic: "test",
				publisher: mockServiceIdentity,
			}
		);

		const id1 = (
			httpClient.post.mock.calls[0][1] as {
				message: { metadata: { messageId: string } };
			}
		).message.metadata.messageId;
		const id2 = (
			httpClient.post.mock.calls[1][1] as {
				message: { metadata: { messageId: string } };
			}
		).message.metadata.messageId;

		expect(id1).not.toBe(id2);
	});
});
