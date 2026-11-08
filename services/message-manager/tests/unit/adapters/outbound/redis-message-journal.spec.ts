import { describe, expect, it, jest } from "@jest/globals";
import type { Message } from "@trading-model/contracts/message-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import { RedisMessageJournal } from "../../../../src/adapters/outbound/redis-message-journal";
import { JOURNAL_RETENTION_MS } from "../../../../src/application/ports/message-journal-port";
import { JOURNAL_TRIMMED_PENDING_TOTAL } from "../../../../src/config/metrics";
import { createMockMessage } from "../../../fixtures/broker.fixture";

const GROUP = { topic: "test.topic", service: "trader-trainer" } as never;
const NOW = 1_700_000_000_000;

function setup(
	call: (...args: string[]) => Promise<unknown> = async (name) =>
		name === "EXISTS" ? 1 : "OK",
	minReplicas?: number
) {
	const redis = {
		call: jest.fn(call),
		sadd: jest.fn(async () => 1),
		smembers: jest.fn(async () => ["test.topic|trader-trainer"]),
	};
	return {
		redis,
		journal: new RedisMessageJournal({
			redis: redis as never,
			keyPrefix: "p",
			minReplicas,
			now: () => NOW,
		}),
	};
}

/** What a message looks like after the journal round trip (dates become strings). */
const wire = (message: Message) => JSON.parse(JSON.stringify(message));
const stored = (message: Message) => ["message", JSON.stringify(message)];

describe("RedisMessageJournal", () => {
	it("should create the group of each service before writing the message, trimming old entries", async () => {
		const { redis, journal } = setup();
		const message = createMockMessage("payload");

		await journal.append(message, ["trader-trainer", "audit-logger-service"]);

		const commands = redis.call.mock.calls.map((args) => args.slice(0, 3));
		expect(commands.map(([name]) => name)).toEqual([
			"EXISTS",
			"XGROUP",
			"XGROUP",
			"XADD",
		]);
		expect(redis.call).toHaveBeenLastCalledWith(
			"XADD",
			"p:journal:test.topic",
			"MINID",
			"~",
			String(NOW - JOURNAL_RETENTION_MS),
			"*",
			"message",
			JSON.stringify(message)
		);
		expect(redis.sadd).toHaveBeenCalledWith(
			"p:journal-groups",
			"test.topic|trader-trainer"
		);
	});

	it("should not register a group again once this process did", async () => {
		const { redis, journal } = setup();

		await journal.append(createMockMessage("a"), ["trader-trainer"]);
		await journal.append(createMockMessage("b"), ["trader-trainer"]);

		const names = redis.call.mock.calls.map(([name]) => name);
		expect(names).toEqual(["EXISTS", "XGROUP", "XADD", "EXISTS", "XADD"]);
		expect(redis.sadd).toHaveBeenCalledTimes(1);
	});

	it("should read with BLOCK on a connection of its own, and close it", async () => {
		const blocking = {
			call: jest.fn(async () => null),
			disconnect: jest.fn(),
		};
		const { redis } = setup();
		const blocked = new RedisMessageJournal({
			redis: redis as never,
			openBlockingRedis: () => blocking as never,
			keyPrefix: "p",
		});

		await blocked.readNew(GROUP, "c", 100, 1000);
		await blocked.readNew(GROUP, "c", 100, 1000);
		blocked.close();

		expect(blocking.call).toHaveBeenCalledWith(
			"XREADGROUP",
			"GROUP",
			"trader-trainer",
			"c",
			"COUNT",
			"100",
			"BLOCK",
			"1000",
			"STREAMS",
			"p:journal:test.topic",
			">"
		);
		expect(blocking.disconnect).toHaveBeenCalledTimes(1);
		expect(redis.call).not.toHaveBeenCalled();
	});

	it("should create the group again after NOGROUP", async () => {
		let lost = true;
		const { redis, journal } = setup(async (name) => {
			if (name === "XREADGROUP" && lost) {
				lost = false;
				throw new Error("NOGROUP No such key or consumer group");
			}
			return "OK";
		});
		await journal.register(GROUP);

		await expect(journal.readNew(GROUP, "c", 5)).resolves.toEqual([]);

		const names = redis.call.mock.calls.map(([name]) => name);
		expect(names).toEqual(["XGROUP", "XREADGROUP", "XGROUP"]);
	});

	it("should register a cached group again when the stream is gone before writing", async () => {
		let streamExists = 1;
		const { redis, journal } = setup(async (name) =>
			name === "EXISTS" ? streamExists : "OK"
		);
		await journal.append(createMockMessage("a"), ["trader-trainer"]);
		streamExists = 0;
		redis.call.mockClear();

		await journal.append(createMockMessage("b"), ["trader-trainer"]);

		expect(redis.call.mock.calls.map(([name]) => name)).toEqual([
			"EXISTS",
			"XGROUP",
			"XADD",
		]);
	});

	it("should create the group again after NOGROUP in claimDue, and rethrow other errors", async () => {
		let lost = true;
		const { redis, journal } = setup(async (name) => {
			if (name === "XPENDING" && lost) {
				lost = false;
				throw new Error("NOGROUP No such key or consumer group");
			}
			return "OK";
		});
		const retry = { floorMs: 1, dueAfterMs: () => 1 };
		await journal.register(GROUP);

		await expect(journal.claimDue(GROUP, "c", retry, 5)).resolves.toEqual([]);
		expect(redis.call.mock.calls.map(([name]) => name)).toEqual([
			"XGROUP",
			"XPENDING",
			"XGROUP",
		]);

		const broken = setup(async () => {
			throw new Error("READONLY nope");
		});
		await expect(broken.journal.claimDue(GROUP, "c", retry, 5)).rejects.toThrow(
			"READONLY"
		);
	});

	it("should accept a group that already exists, and only that error", async () => {
		const existing = setup(async () => {
			throw new Error("BUSYGROUP Consumer Group name already exists");
		});
		await expect(existing.journal.register(GROUP)).resolves.toBeUndefined();

		const broken = setup(async () => {
			throw new Error("READONLY You can't write against a read only replica");
		});
		await expect(broken.journal.register(GROUP)).rejects.toThrow("READONLY");
	});

	it("should refuse a message held by fewer replicas than required", async () => {
		const { journal, redis } = setup(
			async (command) =>
				command === "WAIT" ? 0 : command === "XADD" ? "9-0" : "OK",
			1
		);

		await expect(
			journal.append(createMockMessage("payload"), ["trader-trainer"])
		).rejects.toThrow("held by 0 of 1 replicas");
		// The entry is removed so the publisher's retry cannot be delivered twice.
		expect(redis.call).toHaveBeenCalledWith(
			"XDEL",
			"p:journal:test.topic",
			"9-0"
		);
	});

	it("should accept a message held by enough replicas", async () => {
		const { journal, redis } = setup(
			async (command) => (command === "WAIT" ? 1 : "OK"),
			1
		);

		await journal.append(createMockMessage("payload"), ["trader-trainer"]);

		expect(redis.call).toHaveBeenCalledWith("WAIT", "1", "2000");
	});

	it("should list the registered groups", async () => {
		await expect(setup().journal.groups()).resolves.toEqual([GROUP]);
	});

	it("should write a targeted replay for its service only, and leave the others' groups out of it", async () => {
		const { journal, redis } = setup();
		const message = createMockMessage("payload");

		await journal.append(
			message,
			["audit-logger-service"],
			"audit-logger-service"
		);

		const xadd = redis.call.mock.calls.find(
			([name]) => name === "XADD"
		) as string[];
		expect(xadd.slice(-4)).toEqual([
			"message",
			JSON.stringify(message),
			"only",
			"audit-logger-service",
		]);
		expect(
			redis.call.mock.calls.filter(([name]) => name === "XGROUP")
		).toHaveLength(1);
	});

	it("should settle without delivering an entry targeted at another service", async () => {
		const message = createMockMessage("payload");
		const { journal, redis } = setup(async (command) =>
			command === "XREADGROUP"
				? [
						"p:journal:test.topic",
						[["1-0", [...stored(message), "only", "audit-logger-service"]]],
					]
				: "OK"
		);

		await expect(journal.readNew(GROUP, "replica-1", 5)).resolves.toEqual([]);
		expect(redis.call).toHaveBeenCalledWith(
			"XACK",
			"p:journal:test.topic",
			"trader-trainer",
			"1-0"
		);
	});

	it("should read new entries as first deliveries", async () => {
		const message = createMockMessage("payload");
		const { journal, redis } = setup(async () => [
			"p:journal:test.topic",
			[["1-0", stored(message)]],
		]);

		const entries = await journal.readNew(GROUP, "replica-1", 5);

		expect(entries).toEqual([
			{ id: "1-0", message: wire(message), deliveries: 1 },
		]);
		expect(redis.call).toHaveBeenCalledWith(
			"XREADGROUP",
			"GROUP",
			"trader-trainer",
			"replica-1",
			"COUNT",
			"5",
			"STREAMS",
			"p:journal:test.topic",
			">"
		);
	});

	it("should read nothing from an empty stream", async () => {
		await expect(
			setup(async () => null).journal.readNew(GROUP, "c", 5)
		).resolves.toEqual([]);
	});

	it("should claim only the entries whose retry is due, counting the new attempt", async () => {
		const message = createMockMessage("payload");
		const { journal, redis } = setup(async (command) =>
			command === "XPENDING"
				? [
						["1-0", "dead-replica", 20_000, 2],
						["2-0", "dead-replica", 500, 1],
					]
				: [["1-0", stored(message)]]
		);

		const entries = await journal.claimDue(
			GROUP,
			"replica-1",
			{ floorMs: 100, dueAfterMs: () => 10_000 },
			10
		);

		expect(entries).toEqual([
			{ id: "1-0", message: wire(message), deliveries: 3 },
		]);
		expect(redis.call).toHaveBeenCalledWith(
			"XCLAIM",
			"p:journal:test.topic",
			"trader-trainer",
			"replica-1",
			"10000",
			"1-0"
		);
		expect(redis.call).not.toHaveBeenCalledWith(
			"XCLAIM",
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.anything(),
			"2-0"
		);
	});

	it("should skip and acknowledge an entry trimmed from the stream while still pending", async () => {
		const { journal, redis } = setup(async (command) =>
			command === "XPENDING" ? [["1-0", "c", 20_000, 1]] : [["1-0", null]]
		);

		await expect(
			journal.claimDue(GROUP, "c", { floorMs: 0, dueAfterMs: () => 0 }, 10)
		).resolves.toEqual([]);
		expect(redis.call).toHaveBeenCalledWith(
			"XACK",
			"p:journal:test.topic",
			"trader-trainer",
			"1-0"
		);
	});

	it("should count and log as error an entry trimmed while still pending", async () => {
		const { journal } = setup(async (command) =>
			command === "XPENDING" ? [["1-0", "c", 20_000, 1]] : [["1-0", null]]
		);
		const count = async () =>
			(await JOURNAL_TRIMMED_PENDING_TOTAL.get()).values.find(
				(v) =>
					v.labels.topic === "test.topic" &&
					v.labels.service === "trader-trainer"
			)?.value ?? 0;
		const before = await count();
		const error = jest.spyOn(logger, "error").mockImplementation(() => logger);

		await journal.claimDue(GROUP, "c", { floorMs: 0, dueAfterMs: () => 0 }, 10);

		expect((await count()) - before).toBe(1);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("trimmed"),
			expect.objectContaining({ entryId: "1-0", topic: "test.topic" })
		);
		error.mockRestore();
	});

	it("should acknowledge an entry in its group", async () => {
		const { journal, redis } = setup();

		await journal.ack(GROUP, "1-0");

		expect(redis.call).toHaveBeenCalledWith(
			"XACK",
			"p:journal:test.topic",
			"trader-trainer",
			"1-0"
		);
	});

	describe("lag", () => {
		const info = (extra: unknown[]) => [
			"name",
			"trader-trainer",
			"last-delivered-id",
			`${NOW - 5000}-0`,
			...extra,
		];

		it("should count the pending and unread entries and age the oldest of them", async () => {
			const { journal, redis } = setup(async (name) => {
				if (name === "XINFO") {
					return [info(["lag", 3])];
				}
				if (name === "XPENDING") {
					return [2, `${NOW - 60_000}-0`, "x", []];
				}
				return [[`${NOW - 4000}-0`, ["message", "{}"]]];
			});

			await expect(journal.lag()).resolves.toEqual([
				{
					topic: "test.topic",
					service: "trader-trainer",
					pending: 5,
					oldestPendingAgeMs: 60_000,
				},
			]);
			expect(redis.call.mock.calls.filter(([n]) => n === "XINFO")).toHaveLength(
				1
			);
		});

		it("should report an empty group as no backlog", async () => {
			const { journal } = setup(async (name) => {
				if (name === "XINFO") {
					return [info(["lag", 0])];
				}
				return name === "XPENDING" ? [0, null] : [];
			});

			await expect(journal.lag()).resolves.toEqual([
				expect.objectContaining({ pending: 0, oldestPendingAgeMs: 0 }),
			]);
		});

		it("should skip a topic whose stream is gone", async () => {
			const { journal } = setup(async () => {
				throw new Error("ERR no such key");
			});

			await expect(journal.lag()).resolves.toEqual([]);
		});

		it("should skip a group that vanished between XINFO and XPENDING", async () => {
			const { journal } = setup(async (name) => {
				if (name === "XINFO") {
					return [info(["lag", 0])];
				}
				throw new Error("NOGROUP No such consumer group");
			});

			await expect(journal.lag()).resolves.toEqual([]);
		});

		it("should rethrow any other Redis error", async () => {
			const { journal } = setup(async () => {
				throw new Error("NOPERM");
			});

			await expect(journal.lag()).rejects.toThrow("NOPERM");
		});
	});
});
