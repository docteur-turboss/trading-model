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
import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import { HttpMessageDelivery } from "../../src/adapters/outbound/http-message-delivery";
import { InMemoryMessageJournal } from "../../src/adapters/outbound/in-memory-message-journal";
import { InMemorySubscriptionStore } from "../../src/adapters/outbound/in-memory-subscription-store";
import { DeliveryWorker } from "../../src/application/services/delivery-worker";
import { Dispatcher } from "../../src/application/services/dispatcher";
import { SubscriptionRegistry } from "../../src/application/services/subscription-registry";
import { FileDlqRepository } from "../../src/infrastructure/fallback/dlq-repository";
import {
	mockServiceIdentity,
	mockSubscriberIdentity,
} from "../fixtures/broker.fixture";
import { createMockHttpClient } from "../helpers/broker.helper";

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ host: string; port: number }>>()
		.mockResolvedValue({ host: "10.0.0.1", port: 8444 }),
}));

const PRICE = {
	schemaVersion: "1.0",
	eventType: "PriceUpdate",
	topic: "market.data",
	publisher: mockServiceIdentity,
} as never;

const subscribeParams = (instanceId = mockSubscriberIdentity.instanceId) => ({
	topic: "market.data",
	callbackPath: "message/receive",
	serviceIdentity: { ...mockSubscriberIdentity, instanceId },
});

describe("Message Broker Integration (journal + delivery worker)", () => {
	let httpClient: ReturnType<typeof createMockHttpClient>;
	let dispatcher: Dispatcher;
	let journal: InMemoryMessageJournal;
	let registry: SubscriptionRegistry;
	let now: number;
	const dlqFilePath = join(tmpdir(), `dlq-test-int-${Date.now()}.jsonl`);

	/** A replica's worker: acceptance and workers share the journal (Redis in production). */
	const newWorker = () =>
		new DeliveryWorker({
			journal,
			registry,
			deliveryPort: new HttpMessageDelivery(
				httpClient as never,
				new FileDlqRepository(dlqFilePath)
			),
		});

	beforeEach(() => {
		now = 1_000_000;
		httpClient = createMockHttpClient();
		journal = new InMemoryMessageJournal(() => now);
		registry = new SubscriptionRegistry(
			new InMemorySubscriptionStore(),
			journal
		);
		dispatcher = new Dispatcher({ registry, journal });
	});

	afterAll(async () => {
		if (existsSync(dlqFilePath)) {
			await unlink(dlqFilePath);
		}
	});

	it("should deliver a published message to a subscribed service", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.publish({ price: 50000, symbol: "BTCUSDT" }, PRICE);

		await newWorker().tick();

		expect(httpClient.post).toHaveBeenCalledTimes(1);
		const [targetUrl, body] = httpClient.post.mock.calls[0] as [
			string,
			{ payload: unknown },
		];
		expect(targetUrl).toContain("10.0.0.1:8444");
		expect(targetUrl).toContain("message/receive");
		// Flat body: the subscriber controller reads metadata/payload at the top level.
		expect(body.payload).toEqual({ price: 50000, symbol: "BTCUSDT" });
	});

	it("should answer the publisher while the subscriber is still failing", async () => {
		httpClient.post.mockRejectedValue(new Error("subscriber down"));
		await dispatcher.subscribe(subscribeParams());

		// Nothing is delivered (or retried) inside the publish: it only journals.
		const messageId = await dispatcher.publish({ price: 1 }, PRICE);

		expect(messageId).toEqual(expect.any(String));
		expect(httpClient.post).not.toHaveBeenCalled();
	});

	it("should deliver once per service, not once per instance", async () => {
		await dispatcher.subscribe(subscribeParams("sub-1"));
		await dispatcher.subscribe(subscribeParams("sub-2"));
		await dispatcher.publish({ price: 50000 }, PRICE);

		await newWorker().tick();

		expect(httpClient.post).toHaveBeenCalledTimes(1);
	});

	it("should deliver to every subscribed service", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.subscribe({
			...subscribeParams("al-1"),
			serviceIdentity: {
				serviceName: "audit-logger",
				instanceId: "al-1",
			},
		} as never);
		await dispatcher.publish({ price: 50000 }, PRICE);

		await newWorker().tick();

		expect(httpClient.post).toHaveBeenCalledTimes(2);
	});

	it("should not deliver to unsubscribed services or to another topic", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.unsubscribe({
			topic: "market.data" as Topic,
			instanceId: mockSubscriberIdentity.instanceId as InstanceId,
		});
		await dispatcher.subscribe({
			...subscribeParams("x"),
			topic: "other.topic" as Topic,
		});
		await dispatcher.publish({ price: 50000 }, PRICE);

		await newWorker().tick();

		expect(httpClient.post).not.toHaveBeenCalled();
	});

	it("should retry a failed delivery once it is due, and not before", async () => {
		httpClient.post
			.mockRejectedValueOnce(new Error("Subscriber 1 failed"))
			.mockResolvedValueOnce(undefined);
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.publish({ price: 50000 }, PRICE);
		const worker = newWorker();

		await worker.tick();
		expect(httpClient.post).toHaveBeenCalledTimes(1);

		now += 1000;
		await worker.tick();
		expect(httpClient.post).toHaveBeenCalledTimes(1);

		now += 60_000;
		await worker.tick();
		expect(httpClient.post).toHaveBeenCalledTimes(2);

		now += 600_000;
		await worker.tick();
		expect(httpClient.post).toHaveBeenCalledTimes(2);
	});

	// Process death: the replica that read the message never answered. The
	// journal (Redis in production) survives, another replica finishes the job.
	it("should deliver a message read by a replica that died, from another replica", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.publish({ price: 50000 }, PRICE);
		await journal.readNew(
			{
				topic: "market.data" as Topic,
				service: mockSubscriberIdentity.serviceName,
			},
			"dead-replica",
			10
		);
		await newWorker().tick();
		expect(httpClient.post).not.toHaveBeenCalled();

		now += 60_000;
		await newWorker().tick();

		expect(httpClient.post).toHaveBeenCalledTimes(1);
	});

	it("should keep a message for a service without live subscriber until it subscribes again", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.publish({ price: 50000 }, PRICE);
		await dispatcher.unsubscribe({
			topic: "market.data" as Topic,
			instanceId: mockSubscriberIdentity.instanceId as InstanceId,
		});
		const worker = newWorker();

		await worker.tick();
		expect(httpClient.post).not.toHaveBeenCalled();

		await dispatcher.subscribe(subscribeParams());
		await worker.tick();
		expect(httpClient.post).toHaveBeenCalledTimes(1);
	});

	it("should generate unique message IDs for each publish", async () => {
		await dispatcher.subscribe(subscribeParams());
		await dispatcher.publish({ data: 1 }, PRICE);
		await dispatcher.publish({ data: 2 }, PRICE);

		await newWorker().tick();

		const ids = httpClient.post.mock.calls.map(
			(call) =>
				(call[1] as { metadata: { messageId: string } }).metadata.messageId
		);
		expect(new Set(ids).size).toBe(2);
	});

	it("should deliver as the message arrives to a started worker, and stop cleanly", async () => {
		await dispatcher.subscribe(subscribeParams());
		const worker = newWorker();
		worker.start();
		await new Promise((resolve) => setTimeout(resolve, 20));

		await dispatcher.publish({ data: 1 }, PRICE);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(httpClient.post).toHaveBeenCalledTimes(1);
		await worker.stop();
		await dispatcher.publish({ data: 2 }, PRICE);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(httpClient.post).toHaveBeenCalledTimes(1);
	});
});
