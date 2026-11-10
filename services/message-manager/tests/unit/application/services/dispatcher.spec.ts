import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import { InMemoryMessageJournal } from "../../../../src/adapters/outbound/in-memory-message-journal";
import { InMemorySubscriptionStore } from "../../../../src/adapters/outbound/in-memory-subscription-store";
import { Dispatcher } from "../../../../src/application/services/dispatcher";
import { SubscriptionRegistry } from "../../../../src/application/services/subscription-registry";
import {
	mockServiceIdentity,
	mockSubscribeParams,
	mockSubscriberIdentity,
} from "../../../fixtures/broker.fixture";

const mockLogger = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => mockLogger,
}));

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_PUBLISHED_TOTAL: { inc: jest.fn<(...args: any[]) => any>() },
	MESSAGES_UNROUTED_TOTAL: { inc: jest.fn<(...args: any[]) => any>() },
	SUBSCRIPTION_COUNT: { set: jest.fn<(...args: any[]) => any>() },
}));

import {
	MESSAGES_PUBLISHED_TOTAL,
	MESSAGES_UNROUTED_TOTAL,
	SUBSCRIPTION_COUNT,
} from "../../../../src/config/metrics";

const METADATA = {
	schemaVersion: "1.0",
	eventType: "PriceUpdate",
	topic: "test.topic",
	publisher: mockServiceIdentity,
} as never;

describe("Dispatcher", () => {
	let journal: InMemoryMessageJournal;
	let dispatcher: Dispatcher;

	beforeEach(() => {
		jest.clearAllMocks();
		journal = new InMemoryMessageJournal();
		const registry = new SubscriptionRegistry(
			new InMemorySubscriptionStore(),
			journal
		);
		dispatcher = new Dispatcher({ registry, journal });
	});

	/** What the workers would read for a service, i.e. what was journaled for it. */
	const journaled = (service = mockSubscriberIdentity.serviceName) =>
		journal.readNew({ topic: "test.topic" as Topic, service }, "c", 100);

	it("should journal an accepted message and return its id without delivering", async () => {
		await dispatcher.subscribe(mockSubscribeParams);

		const messageId = await dispatcher.publish({ price: 1 }, METADATA);

		const [entry] = await journaled();
		expect(entry?.message.metadata.messageId).toBe(messageId);
		expect(entry?.message.payload).toEqual({ price: 1 });
	});

	it("should journal one copy per subscriber service, not per instance", async () => {
		await dispatcher.subscribe(mockSubscribeParams);
		await dispatcher.subscribe({
			...mockSubscribeParams,
			serviceIdentity: {
				...mockSubscriberIdentity,
				instanceId: "subscriber-2" as InstanceId,
			},
		});
		await dispatcher.subscribe({
			...mockSubscribeParams,
			serviceIdentity: {
				serviceName: "audit-logger",
				instanceId: "al-1",
			},
		} as never);

		await dispatcher.publish({ price: 1 }, METADATA);

		expect(await journaled()).toHaveLength(1);
		expect(await journaled("audit-logger")).toHaveLength(1);
	});

	it("should not journal for the subscribers of another topic", async () => {
		await dispatcher.subscribe({
			...mockSubscribeParams,
			topic: "other.topic" as Topic,
		});

		await dispatcher.publish({ price: 1 }, METADATA);

		expect(await journaled()).toHaveLength(0);
		expect(MESSAGES_UNROUTED_TOTAL.inc).toHaveBeenCalledWith({
			topic: "test.topic",
		});
	});

	it("should count and log a message no subscription routes", async () => {
		await expect(dispatcher.publish({ price: 1 }, METADATA)).resolves.toEqual(
			expect.any(String)
		);

		expect(MESSAGES_UNROUTED_TOTAL.inc).toHaveBeenCalledWith({
			topic: "test.topic",
		});
		expect(mockLogger.warn).toHaveBeenCalledWith(
			"Message dropped: no subscriber for its topic",
			expect.anything()
		);
	});

	it("should refuse, not drop, an unrouted message that requires a subscriber", async () => {
		const required = {
			...(METADATA as object),
			delivery: { mode: DeliveryMode.AtLeastOnce, requireSubscriber: true },
		} as never;

		await expect(dispatcher.publish({ price: 1 }, required)).rejects.toThrow(
			"No subscriber for topic test.topic"
		);
		expect(await journaled()).toHaveLength(0);
	});

	it("should journal a message that requires a subscriber when one exists", async () => {
		await dispatcher.subscribe(mockSubscribeParams);
		const required = {
			...(METADATA as object),
			delivery: { mode: DeliveryMode.AtLeastOnce, requireSubscriber: true },
		} as never;

		await dispatcher.publish({ price: 1 }, required);

		expect(await journaled()).toHaveLength(1);
	});

	it("should stop routing to an unsubscribed instance", async () => {
		await dispatcher.subscribe(mockSubscribeParams);
		await dispatcher.unsubscribe({
			topic: "test.topic" as Topic,
			instanceId: mockSubscriberIdentity.instanceId as InstanceId,
		});

		await dispatcher.publish({ price: 1 }, METADATA);

		expect(await journaled()).toHaveLength(0);
	});

	it("should count published messages and subscriptions per topic", async () => {
		await dispatcher.subscribe(mockSubscribeParams);
		await dispatcher.publish({ price: 1 }, METADATA);

		expect(MESSAGES_PUBLISHED_TOTAL.inc).toHaveBeenCalledWith({
			topic: "test.topic",
		});
		expect(SUBSCRIPTION_COUNT.set).toHaveBeenCalledWith(
			{ topic: "test.topic" },
			1
		);
	});

	it("should refuse a message the journal cannot take", async () => {
		await dispatcher.subscribe(mockSubscribeParams);
		jest.spyOn(journal, "append").mockRejectedValue(new Error("Redis down"));

		await expect(dispatcher.publish({ price: 1 }, METADATA)).rejects.toThrow(
			"Redis down"
		);
	});
});
