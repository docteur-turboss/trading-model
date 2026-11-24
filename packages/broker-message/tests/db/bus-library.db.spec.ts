import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { Message } from "@trading-model/contracts/message-types";
import Redis from "ioredis";
import { BusConsumer } from "../../src/bus/consumer";
import { DeadStreams } from "../../src/bus/dead-streams";
import { publishToBus } from "../../src/bus/publisher";
import { RedisMessageJournal } from "../../src/bus/redis-journal";
import { deadLetterError } from "../../src/shared/errors";

const mockServiceIdentity = {
	serviceName: "financial-scraper",
	instanceId: "instance-1",
};

const PREFIX = "bus-library-db-spec";
const TOPIC = "test.topic";
const clients: Redis[] = [];

function journal(): RedisMessageJournal {
	const redis = new Redis(process.env.TEST_REDIS_URL as string);
	clients.push(redis);
	return new RedisMessageJournal({
		redis,
		openBlockingRedis: () => redis.duplicate(),
		keyPrefix: PREFIX,
	});
}

const metadata = {
	schemaVersion: "1.0",
	eventType: "PriceUpdate",
	topic: TOPIC,
	publisher: mockServiceIdentity,
} as never;

async function until(check: () => Promise<boolean>): Promise<void> {
	for (let i = 0; i < 100 && !(await check()); i++) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

beforeEach(async () => {
	await journal().redis.call("FLUSHDB");
});

afterAll(async () => {
	await Promise.all(clients.map((client) => client.quit()));
});

describe("bus library — real Redis", () => {
	it("should deliver a published message once per service while message-manager reads the same group", async () => {
		const library = journal();
		const seen: string[] = [];
		const consumer = new BusConsumer({
			journal: library,
			deadStreams: new DeadStreams(library),
			service: "trader-trainer",
			handle: async (message: Message) => {
				seen.push(`library:${message.payload}`);
			},
		});
		await consumer.start([TOPIC]);
		// message-manager's worker: same journal code, same group.
		const worker = journal();
		const group = { topic: TOPIC as never, service: "trader-trainer" };

		for (let i = 0; i < 20; i++) {
			await publishToBus(journal(), i, metadata);
		}
		for (let round = 0; seen.length < 20 && round < 100; round++) {
			for (const entry of await worker.readNew(group, "mm", 5)) {
				seen.push(`mm:${entry.message.payload}`);
				await worker.ack(group, entry.id);
			}
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		await consumer.stop();

		expect(seen.map((item) => item.split(":")[1]).sort()).toEqual(
			Array.from({ length: 20 }, (_, i) => String(i)).sort()
		);
	});

	it("should move a rejected message to the dead stream, replay it to its group only, then delete it", async () => {
		const library = journal();
		const streams = new DeadStreams(library);
		const received: Record<string, number> = { a: 0, b: 0 };
		let reject = true;
		const consume = (service: string, key: string) => {
			const own = journal();
			return new BusConsumer({
				journal: own,
				deadStreams: new DeadStreams(own),
				service,
				handle: async () => {
					if (key === "a" && reject) {
						throw deadLetterError("bad", { reason: "REJECTED_BY_SUBSCRIBER" });
					}
					received[key] += 1;
				},
			});
		};
		const [a, b] = [consume("group-a", "a"), consume("group-b", "b")];
		await Promise.all([a.start([TOPIC]), b.start([TOPIC])]);

		await publishToBus(library, "p", metadata);
		await until(async () => (await streams.length(TOPIC)) === 1);

		const [dead] = await streams.list(TOPIC);
		expect(dead?.group).toBe("group-a");
		expect(
			await library.redis.call("XPENDING", library.stream(TOPIC), "group-a")
		).toEqual([0, null, null, null]);

		reject = false;
		expect(await streams.replay(TOPIC, dead?.id as string)).toBe(true);
		await until(async () => received.a === 1);
		await a.stop();
		await b.stop();

		expect(received).toEqual({ a: 1, b: 1 });
		expect(await streams.length(TOPIC)).toBe(0);
		expect(await streams.delete(TOPIC, "0-1")).toBe(false);
	});
});
