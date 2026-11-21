import { describe, expect, it } from "@jest/globals";

import BrokerMessage, { HELPER } from "../../src/broker-message";
import { RedisMessageJournal } from "../../src/bus/redis-journal";
import { StreamRedis } from "../fixtures/stream-redis";

const TOPIC = "training.model.published";
const REDIS = new StreamRedis();

function broker() {
	const journal = new RedisMessageJournal({ redis: REDIS, keyPrefix: "p" });
	return new BrokerMessage({
		journal,
		instanceId: "i-1" as never,
		serviceName: "trader-trainer" as never,
	});
}

describe("BrokerMessage on the bus (ADR-0073)", () => {
	it("should publish with an XADD and consume what it subscribed to", async () => {
		const bus = broker();
		const received: unknown[] = [];
		await bus.intents([TOPIC] as never, async ({ payload }) => {
			received.push(payload);
		});

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

		expect(received).toEqual([]);
		expect([...REDIS.streams.keys()]).toContain(`p:journal:${TOPIC}`);
	});
});
