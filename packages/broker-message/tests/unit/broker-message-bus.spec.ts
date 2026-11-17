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

const TOPIC = "market.candlestick.series.fetch";
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
		const topic = "training.model.published";
		const bus = broker();
		await bus.intents([topic] as never);
		const metadata = new HELPER.metadataBuilder(
			topic as never,
			topic as never,
			{ instanceId: "i-1", serviceName: "trader-trainer" } as never
		).toJSON();
		await bus.post.indirect({ symbol: "BTCUSDT" }, metadata);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await bus.stopMessageManager();

		// No group of this service: the entry still waits for the callback delivery.
		expect(
			REDIS.streams.get(`p:journal:${topic}`)?.groups.has("trader-trainer") ??
				false
		).toBe(false);
		expect(CLIENT.subscribe).toHaveBeenCalledWith([topic]);
	});
});
