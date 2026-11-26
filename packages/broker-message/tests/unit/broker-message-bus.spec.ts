import { describe, expect, it, jest } from "@jest/globals";

import BusClient, { HELPER } from "../../src/broker-message";
import { RedisMessageJournal } from "../../src/bus/redis-journal";
import { StreamRedis } from "../fixtures/stream-redis";

const TOPIC = "training.model.published";
const REDIS = new StreamRedis();

function broker() {
	const journal = new RedisMessageJournal({ redis: REDIS, keyPrefix: "p" });
	return new BusClient({
		journal,
		instanceId: "i-1" as never,
		serviceName: "trader-trainer" as never,
	});
}

describe("BusClient on the bus (ADR-0073)", () => {
	it("should publish with an XADD and consume what it subscribed to", async () => {
		const bus = broker();
		const received: unknown[] = [];
		await bus.subscribe([TOPIC] as never, async ({ payload }) => {
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
		await bus.publish({ not: "a candle series" }, metadata);
		await new Promise((resolve) => setTimeout(resolve, 100));
		await bus.stop();

		expect(received).toEqual([]);
		expect([...REDIS.streams.keys()]).toContain(`p:journal:${TOPIC}`);
	});

	it("should not block subscribe() while Redis refuses the service's user", async () => {
		const topic = "dlq.entry.added";
		const journal = new RedisMessageJournal({ redis: REDIS, keyPrefix: "q" });
		jest
			.spyOn(journal, "register")
			.mockRejectedValue(new Error("WRONGPASS invalid username-password pair"));
		const bus = new BusClient({
			journal,
			instanceId: "i-1" as never,
			serviceName: "model-evaluator" as never,
		});
		await expect(
			bus.subscribe([topic] as never, async () => undefined)
		).resolves.toBeUndefined();
		await bus.stop();
	});
});
