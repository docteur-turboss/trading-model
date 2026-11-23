import { describe, expect, it, jest } from "@jest/globals";
import { EVENT_MANAGER } from "../../src/event-manager-client";

const CLIENT = {
	subscribe: jest.fn<(...args: any[]) => any>(),
	unsubscribe: jest.fn<(...args: any[]) => any>(),
	publish: jest.fn<(...args: any[]) => any>(),
};

jest.mock("../../src/message-manager-client", () => ({
	MessageManagerClient: jest.fn(() => CLIENT),
}));
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: jest.fn(() => ({})) },
}));

import BrokerMessage, { HELPER } from "../../src/broker-message";
import { RedisMessageJournal } from "../../src/bus/redis-journal";
import { StreamRedis } from "../fixtures/stream-redis";

const TOPIC = "training.model.published";
const REDIS = new StreamRedis();

function broker() {
	const journal = new RedisMessageJournal({ redis: REDIS, keyPrefix: "p" });
	return new BrokerMessage({
		journal,
		tlsPaths: {} as never,
		instanceId: "i-1" as never,
		addressManagerClient: {} as never,
		serviceName: "trader-trainer" as never,
	});
}

async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !check(); i++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("BrokerMessage on the bus (ADR-0073)", () => {
	it("should publish with an XADD, not over HTTP, and consume what it subscribed to", async () => {
		const bus = broker();
		const received: unknown[] = [];
		const off = EVENT_MANAGER.on(
			TOPIC as never,
			((data: unknown) => {
				received.push(data);
			}) as never
		);
		await bus.intents([TOPIC] as never);

		const metadata = new HELPER.metadataBuilder(
			TOPIC as never,
			TOPIC as never,
			{
				instanceId: "i-1",
				serviceName: "financial-scraper",
			} as never
		).toJSON();
		// Payload of this topic is validated by its schema: an invalid one is rejected, not delivered.
		await bus.post.indirect({ not: "a candle series" }, metadata);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await bus.stopMessageManager();
		off();

		expect(CLIENT.publish).not.toHaveBeenCalled();
		expect(received).toEqual([]);
		expect([...REDIS.streams.keys()]).toContain(`p:journal:${TOPIC}`);
		expect(CLIENT.subscribe).toHaveBeenCalledWith([TOPIC]);
	});

	it("should leave a topic with no listener to message-manager's workers, never ack it in process", async () => {
		const topic = "dlq.entry.added";
		const bus = broker();
		await bus.intents([topic] as never);
		const metadata = new HELPER.metadataBuilder(
			topic as never,
			topic as never,
			{ instanceId: "i-1", serviceName: "trader-trainer" } as never
		).toJSON();
		await bus.post.indirect(
			{ entryId: "e1", topic: null, reason: null, actor: null },
			metadata
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await bus.stopMessageManager();

		// No group of this service: the entry still waits for the callback delivery.
		expect(
			REDIS.streams.get(`p:journal:${topic}`)?.groups.has("trader-trainer") ??
				false
		).toBe(false);
		expect(CLIENT.subscribe).toHaveBeenCalledWith([topic]);
	});

	it("should consume in process a topic with a listener registered by on(), metadata included", async () => {
		const topic = "dlq.entry.added";
		const bus = broker();
		const received: unknown[] = [];
		bus.on(
			topic as never,
			((payload: unknown, metadata: { topic: string }) => {
				received.push([payload, metadata.topic]);
			}) as never
		);
		await bus.intents([topic] as never);
		const metadata = new HELPER.metadataBuilder(
			topic as never,
			topic as never,
			{ instanceId: "i-1", serviceName: "model-evaluator" } as never
		).toJSON();
		const payload = { entryId: "e2", topic: null, reason: null, actor: null };
		await bus.post.indirect(payload, metadata);
		await until(() => received.length === 1);
		await bus.stopMessageManager();

		expect(received).toEqual([[payload, topic]]);
	});

	it("should not block intents() while Redis refuses the service's user", async () => {
		const topic = "dlq.entry.added";
		const journal = new RedisMessageJournal({ redis: REDIS, keyPrefix: "q" });
		jest
			.spyOn(journal, "register")
			.mockRejectedValue(new Error("WRONGPASS invalid username-password pair"));
		const bus = new BrokerMessage({
			journal,
			tlsPaths: {} as never,
			instanceId: "i-1" as never,
			addressManagerClient: {} as never,
			serviceName: "model-evaluator" as never,
		});
		bus.on(topic as never, (() => undefined) as never);
		await expect(bus.intents([topic] as never)).resolves.toBeUndefined();
		await bus.stopMessageManager();
	});
});
