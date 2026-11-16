import { describe, expect, it, jest } from "@jest/globals";
import type { Message } from "@trading-model/contracts/message-types";
import { BusConsumer } from "../../../src/bus/consumer";
import { DeadStreams } from "../../../src/bus/dead-streams";
import { publishToBus } from "../../../src/bus/publisher";
import { RedisMessageJournal } from "../../../src/bus/redis-journal";
import { deadLetterError } from "../../../src/shared/errors";
import { createMockMessage } from "../../fixtures/broker.fixture";
import { StreamRedis } from "../../fixtures/stream-redis";

const TOPIC = "test.topic";
const GROUP = { topic: TOPIC as never, service: "trader-trainer" };
const {
	messageId: _id,
	emittedAt: _at,
	...METADATA
} = createMockMessage("x").metadata;

function bus() {
	const redis = new StreamRedis();
	const journal = new RedisMessageJournal({ redis, keyPrefix: "p" });
	return { redis, journal, streams: new DeadStreams(journal) };
}

async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !check(); i++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("publishToBus", () => {
	it("should write the message into the stream of a topic that has a group", async () => {
		const { journal, redis } = bus();
		await journal.register(GROUP);

		await publishToBus(journal, "payload", METADATA);

		const [entry] = redis.streams.get(`p:journal:${TOPIC}`)?.entries ?? [];
		const written = JSON.parse(entry?.[1][1] as string) as Message;
		expect(written.payload).toBe("payload");
		expect(written.metadata.messageId).toBeDefined();
	});

	it("should drop a message nobody subscribes to, and refuse it when a subscriber is required", async () => {
		const { journal, redis } = bus();

		await publishToBus(journal, "p", METADATA);
		await expect(
			publishToBus(journal, "p", {
				...METADATA,
				delivery: { requireSubscriber: true },
			} as never)
		).rejects.toThrow("No subscriber");

		expect(redis.streams.size).toBe(0);
	});

	it("should reject, never succeed, when Redis refuses the write", async () => {
		const { journal, redis } = bus();
		await journal.register(GROUP);
		redis.failures.set("XADD", new Error("OOM command not allowed"));

		await expect(publishToBus(journal, "p", METADATA)).rejects.toThrow("OOM");
	});
});

describe("BusConsumer", () => {
	function consumer(
		handle: (message: Message) => Promise<void>,
		parts = bus(),
		onDeadLetter = jest.fn()
	) {
		return {
			...parts,
			onDeadLetter,
			consumer: new BusConsumer({
				journal: parts.journal,
				deadStreams: parts.streams,
				service: GROUP.service,
				handle,
				onDeadLetter,
			}),
		};
	}
	const pendingOf = (redis: StreamRedis) =>
		redis.streams.get(`p:journal:${TOPIC}`)?.groups.get(GROUP.service)?.pending
			.size;

	it("should acknowledge a handled message", async () => {
		const handled: unknown[] = [];
		const {
			consumer: c,
			journal,
			redis,
		} = consumer(async (m) => {
			handled.push(m.payload);
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", METADATA);
		await until(() => handled.length === 1 && pendingOf(redis) === 0);
		await c.stop();

		expect(handled).toEqual(["a"]);
		expect(pendingOf(redis)).toBe(0);
	});

	it("should handle a later entry while an earlier one is still slow, and let stop() wait for it", async () => {
		const handled: unknown[] = [];
		let release = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const {
			consumer: c,
			journal,
			redis,
		} = consumer(async (m) => {
			if (m.payload === "slow") {
				await slow;
			}
			handled.push(m.payload);
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "slow", METADATA);
		await new Promise((resolve) => setTimeout(resolve, 50));
		await publishToBus(journal, "fast", METADATA);
		await until(() => handled.includes("fast"));

		expect(handled).toEqual(["fast"]);
		const stopped = c.stop();
		release();
		await stopped;
		expect(handled).toEqual(["fast", "slow"]);
		expect(pendingOf(redis)).toBe(0);
	});

	it("should leave a failed message pending for its retry", async () => {
		const {
			consumer: c,
			journal,
			redis,
			streams,
		} = consumer(async () => {
			throw new Error("down");
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", METADATA);
		await until(() => pendingOf(redis) === 1);
		await c.stop();

		expect(pendingOf(redis)).toBe(1);
		expect(await streams.length(TOPIC)).toBe(0);
	});

	it("should dead-letter a rejected message and report it", async () => {
		const {
			consumer: c,
			journal,
			redis,
			streams,
			onDeadLetter,
		} = consumer(async () => {
			throw deadLetterError("bad", { reason: "REJECTED_BY_SUBSCRIBER" });
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", METADATA);
		await until(() => onDeadLetter.mock.calls.length === 1);
		await c.stop();

		const [dead] = await streams.list(TOPIC);
		expect(dead).toMatchObject({
			group: GROUP.service,
			reason: "REJECTED_BY_SUBSCRIBER",
			attempts: 1,
		});
		expect(onDeadLetter).toHaveBeenCalledWith(
			GROUP,
			expect.anything(),
			"REJECTED_BY_SUBSCRIBER",
			dead?.id
		);
		expect(pendingOf(redis)).toBe(0);
	});

	it("should dead-letter on the last allowed attempt, counting deliveries of the pending list", async () => {
		const parts = bus();
		await parts.journal.register(GROUP);
		await publishToBus(parts.journal, "a", METADATA);
		const [read] = await parts.journal.readNew(GROUP, "mm", 1);
		const pending = parts.redis.streams
			.get(`p:journal:${TOPIC}`)
			?.groups.get(GROUP.service)
			?.pending.get(read?.id as string);
		(pending as { deliveries: number }).deliveries = 9;
		const { consumer: c, onDeadLetter } = consumer(async () => {
			throw new Error("down");
		}, parts);

		await c.start([TOPIC]);
		await until(() => onDeadLetter.mock.calls.length === 1);
		await c.stop();

		expect((await parts.streams.list(TOPIC))[0]?.attempts).toBe(10);
	});

	it("should leave the entry pending when the dead stream write fails", async () => {
		const {
			consumer: c,
			journal,
			redis,
		} = consumer(async () => {
			throw deadLetterError("bad", { reason: "R" });
		});
		await c.start([TOPIC]);
		redis.failures.set("XACK", new Error("READONLY"));
		await publishToBus(journal, "a", METADATA);
		await until(() => redis.failures.size === 0);
		await c.stop();

		expect(pendingOf(redis)).toBe(1);
	});
});

describe("DeadStreams", () => {
	async function dead() {
		const parts = bus();
		await parts.journal.register(GROUP);
		await parts.journal.register({ ...GROUP, service: "other" });
		await publishToBus(parts.journal, "a", METADATA);
		const [entry] = await parts.journal.readNew(GROUP, "c", 1);
		await parts.streams.deadLetter(
			GROUP,
			entry?.id as string,
			entry?.message as Message,
			"R",
			3
		);
		return parts;
	}

	it("should replay an entry to its group only and remove it", async () => {
		const { streams, journal } = await dead();
		const [letter] = await streams.list(TOPIC);

		expect(await streams.replay(TOPIC, letter?.id as string)).toBe(true);

		expect(await streams.length(TOPIC)).toBe(0);
		expect(
			await journal.readNew({ ...GROUP, service: "other" }, "c", 10)
		).toHaveLength(1);
		expect(await journal.readNew(GROUP, "c", 10)).toHaveLength(1);
	});

	it("should delete an entry, and say when it does not exist", async () => {
		const { streams } = await dead();
		const [letter] = await streams.list(TOPIC);

		expect(await streams.delete(TOPIC, letter?.id as string)).toBe(true);
		expect(await streams.delete(TOPIC, "0-1")).toBe(false);
		expect(await streams.replay(TOPIC, "0-1")).toBe(false);
	});

	it("should throw when the transaction fails, so the entry stays pending", async () => {
		const { streams, redis } = await dead();
		redis.failures.set("XACK", new Error("READONLY"));

		await expect(
			streams.deadLetter(GROUP, "1-0", createMockMessage("x"), "R", 1)
		).rejects.toThrow("Dead letter not stored");
	});
});
