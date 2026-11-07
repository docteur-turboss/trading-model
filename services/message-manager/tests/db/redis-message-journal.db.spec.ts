import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import Redis from "ioredis";
import { HttpMessageDelivery } from "../../src/adapters/outbound/http-message-delivery";
import { InMemorySubscriptionStore } from "../../src/adapters/outbound/in-memory-subscription-store";
import { RedisMessageJournal } from "../../src/adapters/outbound/redis-message-journal";
import { DeliveryWorker } from "../../src/application/services/delivery-worker";
import { Dispatcher } from "../../src/application/services/dispatcher";
import { SubscriptionRegistry } from "../../src/application/services/subscription-registry";
import {
	createMockMessage,
	mockServiceIdentity,
	mockSubscribeParams,
} from "../fixtures/broker.fixture";
import { createMockHttpClient } from "../helpers/broker.helper";

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ host: string; port: number }>>()
		.mockResolvedValue({ host: "10.0.0.1", port: 8444 }),
}));

const KEY_PREFIX = "message-manager-journal-db-spec";
const URL = process.env.TEST_REDIS_URL as string;
const clients: Redis[] = [];

/** A new connection stands for a replica (or the same one after a restart). */
function replica(): Redis {
	const client = new Redis(URL);
	clients.push(client);
	return client;
}

const journalOn = (redis: Redis, minReplicas = 0) =>
	new RedisMessageJournal({ redis, keyPrefix: KEY_PREFIX, minReplicas });

const stream = () => `${KEY_PREFIX}:journal:${mockSubscribeParams.topic}`;

const GROUP = {
	topic: mockSubscribeParams.topic,
	service: mockSubscribeParams.serviceIdentity.serviceName,
} as never;
const RETRY_NOW = { floorMs: 0, dueAfterMs: () => 0 };

const metadata = {
	schemaVersion: "1.0",
	eventType: "PriceUpdate",
	topic: mockSubscribeParams.topic,
	publisher: mockServiceIdentity,
} as never;

beforeEach(async () => {
	await replica().flushdb();
});

afterAll(async () => {
	await Promise.all(clients.map((client) => client.quit()));
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

describe("accepted message interrupted by a process stop — real Redis", () => {
	/** One message-manager process: its own connection, dispatcher and worker. */
	function process_() {
		const journal = journalOn(replica());
		const http = createMockHttpClient();
		const registry = new SubscriptionRegistry(
			// Subscriptions live in Redis too in production; this spec is about the journal.
			subscriptions,
			journal
		);
		return {
			http,
			dispatcher: new Dispatcher({ registry, journal }),
			worker: new DeliveryWorker({
				journal,
				registry,
				deliveryPort: new HttpMessageDelivery(
					http as never,
					{
						insert: jest.fn(async () => undefined),
					} as never
				),
			}),
		};
	}
	const subscriptions = new InMemorySubscriptionStore();

	it("should deliver after the restart a message accepted before the stop", async () => {
		const before = process_();
		await before.dispatcher.subscribe(mockSubscribeParams);
		const messageId = await before.dispatcher.publish({ price: 1 }, metadata);
		// The process stops here: it never delivered anything.
		expect(before.http.post).not.toHaveBeenCalled();

		const after = process_();
		await after.worker.tick();

		expect(after.http.post).toHaveBeenCalledTimes(1);
		const body = after.http.post.mock.calls[0]?.[1] as {
			metadata: { messageId: string };
		};
		expect(body.metadata.messageId).toBe(messageId);
	});
});
