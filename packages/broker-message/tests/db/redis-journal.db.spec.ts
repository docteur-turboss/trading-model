import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import Redis from "ioredis";
import type { JournalGroup } from "../../src/bus/journal.port";
import { RedisMessageJournal } from "../../src/bus/redis-journal";
import { createMockMessage } from "../fixtures/broker.fixture";

const KEY_PREFIX = "message-manager-journal-db-spec";
const URL = process.env.TEST_REDIS_URL as string;
const TOPIC = "test.topic";
const clients: Redis[] = [];

/** A new connection stands for a replica (or the same one after a restart). */
function replica(): Redis {
	const client = new Redis(URL);
	clients.push(client);
	return client;
}

const journalOn = (redis: Redis, minReplicas = 0) =>
	new RedisMessageJournal({ redis, keyPrefix: KEY_PREFIX, minReplicas });

const stream = () => `${KEY_PREFIX}:journal:${TOPIC}`;

const GROUP: JournalGroup = {
	topic: TOPIC as JournalGroup["topic"],
	service: "trader-trainer",
};
const RETRY_NOW = { floorMs: 0, dueAfterMs: () => 0 };

beforeEach(async () => {
	await replica().flushdb();
});

afterAll(async () => {
	await Promise.all(
		clients.map((client) =>
			client.status === "end" ? undefined : client.quit()
		)
	);
});

describe("RedisMessageJournal — real Redis", () => {
	it("should hand a message to each group once, whichever replica reads", async () => {
		const [a, b] = [journalOn(replica()), journalOn(replica())];
		await a.append(createMockMessage("m1"), [GROUP.service, "other-service"]);

		const first = await a.readNew(GROUP, "replica-a", 10);
		const second = await b.readNew(GROUP, "replica-b", 10);

		expect(first.map((entry) => entry.message.payload)).toEqual(["m1"]);
		expect(second).toEqual([]);
		const other = await b.readNew(
			{ ...GROUP, service: "other-service" },
			"b",
			10
		);
		expect(other).toHaveLength(1);
	});

	it("should hand an entry written for one service to that group only", async () => {
		const journal = journalOn(replica());
		const other = { ...GROUP, service: "other-service" };
		await journal.register(GROUP);
		await journal.register(other);
		await journal.append(
			createMockMessage("replay"),
			[GROUP.service],
			GROUP.service
		);

		await expect(journal.readNew(other, "b", 10)).resolves.toEqual([]);
		const mine = await journal.readNew(GROUP, "a", 10);
		expect(mine.map((entry) => entry.message.payload)).toEqual(["replay"]);
	});

	it("should not hand a group a message written before the group existed", async () => {
		const journal = journalOn(replica());
		await journal.append(createMockMessage("early"), ["first-service"]);

		await journal.register(GROUP);

		await expect(journal.readNew(GROUP, "c", 10)).resolves.toEqual([]);
	});

	it("should give a message read by a dead replica to another one, with the attempt counted", async () => {
		const accepted = journalOn(replica());
		await accepted.append(createMockMessage("m1"), [GROUP.service]);
		const [read] = await accepted.readNew(GROUP, "dead-replica", 10);
		expect(read?.deliveries).toBe(1);

		// The replica died: a fresh connection, another consumer name.
		const survivor = journalOn(replica());
		const [claimed] = await survivor.claimDue(GROUP, "survivor", RETRY_NOW, 10);

		expect(claimed?.message.payload).toBe("m1");
		expect(claimed?.deliveries).toBe(2);
		await survivor.ack(GROUP, claimed?.id as string);
		await expect(
			survivor.claimDue(GROUP, "survivor", RETRY_NOW, 10)
		).resolves.toEqual([]);
	});

	it("should leave an entry alone until its retry is due", async () => {
		const journal = journalOn(replica());
		await journal.append(createMockMessage("m1"), [GROUP.service]);
		await journal.readNew(GROUP, "replica-a", 10);

		await expect(
			journal.claimDue(
				GROUP,
				"replica-b",
				{ floorMs: 0, dueAfterMs: () => 60_000 },
				10
			)
		).resolves.toEqual([]);
	});

	it("should know the groups every replica registered, without KEYS", async () => {
		await journalOn(replica()).register(GROUP);
		await journalOn(replica()).register({ ...GROUP, service: "other-service" });

		const groups = await journalOn(replica()).groups();

		expect(groups).toEqual(
			expect.arrayContaining([GROUP, { ...GROUP, service: "other-service" }])
		);
	});

	// A single node has no replica to hold the write: WAIT 1 times out with 0.
	it("should refuse a message no replica holds when one is required", async () => {
		await expect(
			journalOn(replica(), 1).append(createMockMessage("m1"), [GROUP.service])
		).rejects.toThrow("held by 0 of 1 replicas");
		// The refused entry is removed: the publisher's retry must not be delivered twice.
		expect(await replica().xlen(stream())).toBe(0);
	});

	it("should drop a pending entry trimmed from the stream, whatever the Redis version", async () => {
		const journal = journalOn(replica());
		await journal.append(createMockMessage("m1"), [GROUP.service]);
		await journal.readNew(GROUP, "c1", 10);
		await replica().xtrim(stream(), "MAXLEN", 0);

		const claimed = await journal.claimDue(GROUP, "c2", RETRY_NOW, 10);

		expect(claimed).toEqual([]);
		const pending = (await replica().xpending(stream(), GROUP.service)) as [
			number,
		];
		expect(pending[0]).toBe(0);
	});
});

describe("RedisMessageJournal blocking reads — real Redis", () => {
	it("should wake a blocked read on append", async () => {
		const redis = replica();
		const journal = new RedisMessageJournal({
			redis,
			openBlockingRedis: () => replica(),
			keyPrefix: KEY_PREFIX,
		});
		await journal.append(createMockMessage("m1"), [GROUP.service]);

		const read = journal.readNew(GROUP, "c1", 100, 5000);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const startedAt = Date.now();
		await journal.append(createMockMessage("m2"), [GROUP.service]);
		const entries = await read;

		expect(entries).toHaveLength(1);
		const latencyMs = Date.now() - startedAt;
		process.stdout.write(`publish -> blocked read latency: ${latencyMs} ms
`);
		expect(latencyMs).toBeLessThan(500);
		journal.close();
	});

	it("should create the group again when Redis lost it", async () => {
		const journal = journalOn(replica());
		await journal.register(GROUP);
		await replica().flushdb();

		await expect(journal.readNew(GROUP, "c1", 10)).resolves.toEqual([]);
		await journal.append(createMockMessage("m1"), [GROUP.service]);

		await expect(journal.readNew(GROUP, "c1", 10)).resolves.toHaveLength(1);
	});

	it("should deliver a message published after Redis lost everything, with no read in between", async () => {
		const journal = journalOn(replica());
		await journal.register(GROUP);
		await replica().flushdb();

		await journal.append(createMockMessage("m1"), [GROUP.service]);

		await expect(journal.readNew(GROUP, "c1", 10)).resolves.toHaveLength(1);
	});
});
