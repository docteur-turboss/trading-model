import { describe, expect, it, jest } from "@jest/globals";
import {
	type Context,
	context,
	propagation,
	ROOT_CONTEXT,
	trace,
} from "@opentelemetry/api";
import type { Message } from "@trading-model/contracts/message-types";
import { DurationMs } from "@trading-model/primitives/primitives";
import * as backoff from "../../../src/bus/backoff";
import { BusConsumer } from "../../../src/bus/consumer";
import { DeadStreams } from "../../../src/bus/dead-streams";
import {
	MESSAGES_DELIVERED_TOTAL,
	MESSAGES_DLQ_TOTAL,
	PUBLISHER_REJECTED_TOTAL,
} from "../../../src/bus/metrics";
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
		handle: (message: Message, signal: AbortSignal) => Promise<void>,
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

	it("should reject and count a message published under a name the topic does not allow", async () => {
		const handled: unknown[] = [];
		const rejected = jest.spyOn(PUBLISHER_REJECTED_TOTAL, "inc");
		const topic = "training.model.published";
		const parts = bus();
		const {
			consumer: c,
			journal,
			redis,
		} = consumer(async (m) => {
			handled.push(m.payload);
		}, parts);
		await c.start([topic]);
		await publishToBus(journal, "forged", {
			...METADATA,
			topic,
			publisher: { ...METADATA.publisher, serviceName: "financial-scraper" },
		} as never);
		await until(() => rejected.mock.calls.length === 1);
		await c.stop();

		expect(handled).toEqual([]);
		expect(rejected.mock.calls[0]?.[0]).toEqual({
			topic,
			publisher: "financial-scraper",
		});
		expect(
			redis.streams.get(`p:journal:${topic}`)?.groups.get(GROUP.service)
				?.pending.size
		).toBe(0);
		rejected.mockRestore();
	});

	it("should deliver a dlq.entry.added entry published by message-manager", async () => {
		const handled: unknown[] = [];
		const topic = "dlq.entry.added";
		const parts = bus();
		const { consumer: c, journal } = consumer(async (m) => {
			handled.push(m.payload);
		}, parts);
		await c.start([topic]);
		await publishToBus(journal, "dead", {
			...METADATA,
			topic,
			publisher: { ...METADATA.publisher, serviceName: "message-manager" },
		} as never);
		await until(() => handled.length === 1);
		await c.stop();

		expect(handled).toEqual(["dead"]);
	});

	it("should run the handler in the publisher trace and count the delivery", async () => {
		// Minimal synchronous context manager: the API default is a no-op one.
		let active: Context = ROOT_CONTEXT;
		context.setGlobalContextManager({
			active: () => active,
			with: (ctx, fn, thisArg, ...args) => {
				const previous = active;
				active = ctx;
				try {
					return fn.call(thisArg, ...args);
				} finally {
					active = previous;
				}
			},
			bind: (_ctx, target) => target,
			enable() {
				return this;
			},
			disable() {
				return this;
			},
		});
		MESSAGES_DELIVERED_TOTAL.reset();
		const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
		// No W3C propagator is registered in tests: extract builds the span context itself.
		jest.spyOn(propagation, "extract").mockImplementation((_ctx, carrier) =>
			trace.setSpanContext(ROOT_CONTEXT, {
				traceId: (carrier as { traceparent: string }).traceparent.split(
					"-"
				)[1] as string,
				spanId: "00f067aa0ba902b7",
				traceFlags: 1,
			})
		);
		const seen: (string | undefined)[] = [];
		const { consumer: c, journal } = consumer(async () => {
			seen.push(trace.getSpanContext(context.active())?.traceId);
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", {
			...METADATA,
			traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
		});
		await until(() => seen.length === 1);
		await c.stop();
		context.disable();
		jest.restoreAllMocks();

		expect(seen).toEqual([traceId]);
		expect(
			(await MESSAGES_DELIVERED_TOTAL.get()).values.find(
				(v) => v.labels.topic === TOPIC && v.labels.status === "success"
			)?.value
		).toBe(1);
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

	it("should not claim again an entry whose handler is still running", async () => {
		let calls = 0;
		let release = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { consumer: c, journal } = consumer(async () => {
			calls++;
			await slow;
		});
		const claims = jest.spyOn(journal, "claimDue");
		await c.start([TOPIC]);
		await publishToBus(journal, "slow", METADATA);
		await until(() => calls === 1);
		// The fake Redis reports every pending entry as due: jump past the 2 s claim period.
		const before = claims.mock.calls.length;
		const now = Date.now();
		jest.spyOn(Date, "now").mockImplementation(() => now + 3000);
		await until(() => claims.mock.calls.length > before);
		expect(claims.mock.calls.length).toBeGreaterThan(before);
		jest.spyOn(Date, "now").mockRestore();
		const stopped = c.stop();
		release();
		await stopped;

		expect(calls).toBe(1);
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

	it("should abandon a handler that never ends and leave its entry pending", async () => {
		jest.replaceProperty(backoff, "HANDLER_TIMEOUT_MS", DurationMs.of(50));
		jest.replaceProperty(backoff, "ABORT_GRACE_MS", DurationMs.of(50));
		let signal: AbortSignal | undefined;
		const {
			consumer: c,
			journal,
			redis,
		} = consumer((_message, s) => {
			signal = s;
			return new Promise(() => {});
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", METADATA);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await c.stop();

		expect(signal?.aborted).toBe(true);
		expect(pendingOf(redis)).toBe(1);
		expect(
			(await MESSAGES_DELIVERED_TOTAL.get()).values.some(
				(v) => v.labels.status === "failed" && v.value >= 1
			)
		).toBe(true);
	});

	it.each([
		[
			"holds the slot for the whole grace while the handler runs on",
			false,
			450,
		],
		["frees the slot as soon as the aborted handler returns", true, 0],
	])("should %s", async (_name, returnsOnAbort, minStopMs) => {
		jest.replaceProperty(backoff, "HANDLER_TIMEOUT_MS", DurationMs.of(50));
		jest.replaceProperty(backoff, "ABORT_GRACE_MS", DurationMs.of(500));
		let signal: AbortSignal | undefined;
		const { consumer: c, journal } = consumer((_message, s) => {
			signal = s;
			return new Promise<void>((resolve) => {
				if (returnsOnAbort) {
					s?.addEventListener("abort", () => resolve());
				}
			});
		});
		await c.start([TOPIC]);
		await publishToBus(journal, "a", METADATA);
		await until(() => signal?.aborted === true);
		const startedAt = Date.now();
		await c.stop();
		const waited = Date.now() - startedAt;

		// stop() waits for the in-flight slots: still taken during the grace, free once the handler returned.
		if (returnsOnAbort) {
			expect(waited).toBeLessThan(300);
		} else {
			expect(waited).toBeGreaterThanOrEqual(minStopMs - 50);
		}
	});

	it("should dead-letter a rejected message and report it", async () => {
		MESSAGES_DLQ_TOTAL.reset();
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
		expect(
			(await MESSAGES_DLQ_TOTAL.get()).values.find(
				(v) => v.labels.topic === TOPIC
			)?.value
		).toBe(1);
		expect(onDeadLetter).toHaveBeenCalledWith(
			GROUP,
			expect.anything(),
			"REJECTED_BY_SUBSCRIBER",
			dead?.id
		);
		expect(pendingOf(redis)).toBe(0);
	});

	it("should drop a non-JSON entry, dead-letter one without publisher and still handle the valid one", async () => {
		const handled: unknown[] = [];
		const parts = bus();
		const {
			consumer: c,
			journal,
			redis,
			streams,
		} = consumer(async (m) => {
			handled.push(m.payload);
		}, parts);
		await c.start([TOPIC]);
		await redis.call("XADD", journal.stream(TOPIC), "*", "message", "not-json");
		await redis.call("XADD", journal.stream(TOPIC), "*", "message", "{}");
		await publishToBus(journal, "ok", METADATA);
		await until(() => handled.length === 1 && pendingOf(redis) === 0);
		await c.stop();

		expect(handled).toEqual(["ok"]);
		expect(await streams.list(TOPIC)).toEqual([
			expect.objectContaining({
				reason: expect.stringContaining("publisher.serviceName"),
			}),
		]);
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

	it("should dead-letter a crashed entry past MAX_RETRIES without calling the handler", async () => {
		const parts = bus();
		await parts.journal.register(GROUP);
		await publishToBus(parts.journal, "a", METADATA);
		const [read] = await parts.journal.readNew(GROUP, "mm", 1);
		const pending = parts.redis.streams
			.get(`p:journal:${TOPIC}`)
			?.groups.get(GROUP.service)
			?.pending.get(read?.id as string);
		(pending as { deliveries: number }).deliveries = 10;
		const handler = jest.fn<(...args: any[]) => any>();
		const { consumer: c, onDeadLetter } = consumer(handler, parts);

		await c.start([TOPIC]);
		await until(() => onDeadLetter.mock.calls.length === 1);
		await c.stop();

		expect(handler).not.toHaveBeenCalled();
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
