import { describe, expect, it, jest } from "@jest/globals";
import type { Message } from "@trading-model/contracts/message-types";
import { logger } from "@trading-model/http/logger";
import { JOURNAL_RETENTION_MS } from "../../../src/bus/journal.port";
import { JOURNAL_TRIMMED_PENDING_TOTAL } from "../../../src/bus/metrics";
import {
	JOURNAL_WRITE_OPTIONS,
	openJournalWriter,
	RedisMessageJournal,
} from "../../../src/bus/redis-journal";
import { createMockMessage } from "../../fixtures/broker.fixture";

const GROUP = { topic: "test.topic", service: "trader-trainer" } as never;
const NOW = 1_700_000_000_000;

function setup(
	call: (...args: string[]) => Promise<unknown> = async (name) =>
		name === "EXISTS" ? 1 : "OK",
	minReplicas?: number
) {
	const redis = {
		call: jest.fn(call),
		sadd: jest.fn(async (..._args: any[]) => 1),
		smembers: jest.fn(async (..._args: any[]) => ["test.topic|trader-trainer"]),
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
	it("should remove only idle consumers with nothing pending", async () => {
		const row = (name: string, pending: number, idle: number) => [
			"name",
			name,
			"pending",
			pending,
			"idle",
			idle,
		];
		const { redis, journal } = setup(async (name) =>
			name === "XINFO"
				? [
						row("dead", 0, 9e6),
						row("busy", 2, 9e6),
						row("me", 0, 9e6),
						row("new", 0, 1),
					]
				: "OK"
		);

		await journal.pruneConsumers(GROUP, "me", 600_000);

		const deletes = redis.call.mock.calls.filter(([name]) => name === "XGROUP");
		expect(deletes).toEqual([
			[
				"XGROUP",
				"DELCONSUMER",
				"p:journal:test.topic",
				"trader-trainer",
				"dead",
			],
		]);
	});

	it("should create the group of each service before writing the message, trimming old entries", async () => {
		const { redis, journal } = setup();
		const message = createMockMessage("payload");

		await journal.append(message, ["trader-trainer", "audit-logger"]);

		const commands = redis.call.mock.calls.map((args) => args.slice(0, 3));
		expect(commands.map(([name]) => name)).toEqual([
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

	it("should register the group on every append, never trusting a cache a retire elsewhere may have emptied", async () => {
		const { redis, journal } = setup();

		await journal.append(createMockMessage("a"), ["trader-trainer"]);
		await journal.append(createMockMessage("b"), ["trader-trainer"]);

		const names = redis.call.mock.calls.map(([name]) => name);
		expect(names).toEqual(["XGROUP", "XADD", "XGROUP", "XADD"]);
		expect(redis.sadd).toHaveBeenCalledTimes(2);
	});

	it("should trim by the 24 h MINID on every append, never by length", async () => {
		const { redis, journal } = setup();

		for (let i = 0; i < 100; i++) {
			await journal.append(createMockMessage("a"), ["trader-trainer"]);
		}

		const modes = redis.call.mock.calls
			.filter(([name]) => name === "XADD")
			.map(([, , mode]) => mode);
		expect(modes).toHaveLength(100);
		expect(new Set(modes)).toEqual(new Set(["MINID"]));
	});

	it("should write and WAIT on a connection of its own, apart from XACK", async () => {
		const writer = {
			call: jest.fn(async (command: string, ..._args: any[]) =>
				command === "WAIT" ? 1 : "9-0"
			),
			sadd: jest.fn(async (..._args: any[]) => 1),
			disconnect: jest.fn<(...args: any[]) => any>(),
		};
		const { redis } = setup();
		const opened = jest.fn(() => writer as never);
		const journal = new RedisMessageJournal({
			redis: redis as never,
			openWriteRedis: opened,
			keyPrefix: "p",
			minReplicas: 1,
		});

		await journal.append(createMockMessage("a"), ["trader-trainer"]);
		await journal.append(createMockMessage("b"), ["trader-trainer"]);
		await journal.ack(GROUP, "1-0");
		journal.close();

		expect(opened).toHaveBeenCalledTimes(1);
		expect(writer.call.mock.calls.map(([name]) => name)).toEqual([
			"XGROUP",
			"XADD",
			"WAIT",
			"XGROUP",
			"XADD",
			"WAIT",
		]);
		expect(writer.sadd).toHaveBeenCalledTimes(2);
		expect(redis.call.mock.calls.map(([name]) => name)).toEqual(["XACK"]);
		expect(redis.sadd).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(writer.disconnect).toHaveBeenCalledTimes(1);
	});

	it("should read with BLOCK on a connection of its own, and close it", async () => {
		const blocking = {
			call: jest.fn(async (..._args: any[]) => null),
			disconnect: jest.fn<(...args: any[]) => any>(),
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

	it("should cover concurrent appends with one WAIT, resolving each only after it, and refuse them all together", async () => {
		let answer = 1;
		const { journal, redis } = setup(
			async (command) =>
				command === "WAIT" ? answer : command === "XADD" ? "9-0" : "OK",
			1
		);
		const append = () =>
			journal.append(createMockMessage("payload"), ["trader-trainer"]);

		await Promise.all(Array.from({ length: 5 }, append));
		const waits = () =>
			redis.call.mock.calls.filter(([command]) => command === "WAIT").length;
		expect(waits()).toBe(1);

		answer = 0;
		const refused = await Promise.allSettled(Array.from({ length: 5 }, append));
		expect(refused.every((r) => r.status === "rejected")).toBe(true);
		expect(waits()).toBe(2);
		const xdels = redis.call.mock.calls.filter(([c]) => c === "XDEL").length;
		expect(xdels).toBe(5);
	});

	it("should list the registered groups", async () => {
		await expect(setup().journal.groups()).resolves.toEqual([GROUP]);
	});

	it("should write a targeted replay for its service only, and leave the others' groups out of it", async () => {
		const { journal, redis } = setup();
		const message = createMockMessage("payload");

		await journal.append(message, ["audit-logger"], "audit-logger");

		const xadd = redis.call.mock.calls.find(
			([name]) => name === "XADD"
		) as string[];
		expect(xadd.slice(-4)).toEqual([
			"message",
			JSON.stringify(message),
			"only",
			"audit-logger",
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
						[
							"p:journal:test.topic",
							[["1-0", [...stored(message), "only", "audit-logger"]]],
						],
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
			["p:journal:test.topic", [["1-0", stored(message)]]],
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

	it("should send one XCLAIM per min-idle value, keep the XPENDING order and skip entries another replica took", async () => {
		const message = createMockMessage("payload");
		const { journal, redis } = setup(async (command, ...args) => {
			if (command === "XPENDING") {
				return [
					["1-0", "d", 20_000, 1],
					["2-0", "d", 20_000, 3],
					["3-0", "d", 20_000, 1],
					["4-0", "d", 20_000, 1],
				];
			}
			// Min-idle 1 claims 1-0 and 3-0 (4-0 was taken elsewhere); min-idle 3 claims 2-0.
			return args[3] === "1"
				? [
						["3-0", stored(message)],
						["1-0", stored(message)],
					]
				: [["2-0", stored(message)]];
		});

		const claimed = await journal.claimDue(
			GROUP,
			"c",
			{ floorMs: 0, dueAfterMs: (deliveries) => deliveries },
			10
		);

		expect(claimed.map((entry) => [entry.id, entry.deliveries])).toEqual([
			["1-0", 2],
			["2-0", 4],
			["3-0", 2],
		]);
		expect(redis.call).toHaveBeenCalledTimes(3);
		expect(redis.call).toHaveBeenCalledWith(
			"XCLAIM",
			"p:journal:test.topic",
			"trader-trainer",
			"c",
			"1",
			"1-0",
			"3-0",
			"4-0"
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
		JOURNAL_TRIMMED_PENDING_TOTAL.reset();
		const { journal } = setup(async (command) =>
			command === "XPENDING" ? [["1-0", "c", 20_000, 1]] : [["1-0", null]]
		);
		const error = jest.spyOn(logger, "error").mockImplementation(() => logger);

		await journal.claimDue(GROUP, "c", { floorMs: 0, dueAfterMs: () => 0 }, 10);

		expect(
			(await JOURNAL_TRIMMED_PENDING_TOTAL.get()).values.find(
				(v) => v.labels.topic === "test.topic"
			)?.value
		).toBe(1);
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

describe("openJournalWriter", () => {
	function fakeClient() {
		let onReady: () => void = () => undefined;
		const writer = {
			call: jest.fn<(...args: any[]) => any>(),
			sadd: jest.fn<(...args: any[]) => any>(),
			disconnect: jest.fn(),
			once: (_event: "ready", cb: () => void) => {
				onReady = cb;
			},
		};
		const duplicate = jest.fn<(options: object) => typeof writer>(() => writer);
		return { writer, duplicate, ready: () => onReady() };
	}

	it("should open a writer without offline queue and resolve only once it is ready", async () => {
		const { writer, duplicate, ready } = fakeClient();
		let resolved = false;
		const opening = openJournalWriter({ duplicate }).then((w) => {
			resolved = true;
			return w;
		});

		await Promise.resolve();
		expect(resolved).toBe(false);
		ready();

		expect(await opening).toBe(writer);
		expect(duplicate).toHaveBeenCalledWith(
			expect.objectContaining({ enableOfflineQueue: false })
		);
		expect(JOURNAL_WRITE_OPTIONS.commandTimeout).toBeGreaterThan(2000);
	});

	it("should reject and disconnect when the writer never becomes ready", async () => {
		jest.useFakeTimers();
		try {
			const { writer, duplicate } = fakeClient();
			const opening = openJournalWriter({ duplicate });
			const assertion = expect(opening).rejects.toThrow("not ready");
			jest.advanceTimersByTime(JOURNAL_WRITE_OPTIONS.commandTimeout);
			await assertion;
			expect(writer.disconnect).toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});
});
