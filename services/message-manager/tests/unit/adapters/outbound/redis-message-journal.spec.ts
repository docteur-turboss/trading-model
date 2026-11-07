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
	call: (...args: string[]) => Promise<unknown> = async () => "OK",
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
});
