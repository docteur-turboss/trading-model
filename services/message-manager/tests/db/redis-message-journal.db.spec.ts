import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { JournalGroup } from "@trading-model/broker-message/bus/journal.port";
import { RedisMessageJournal } from "@trading-model/broker-message/bus/redis-journal";
import Redis from "ioredis";
import { HttpMessageDelivery } from "../../src/adapters/outbound/http-message-delivery";
import { InMemorySubscriptionStore } from "../../src/adapters/outbound/in-memory-subscription-store";
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

const GROUP: JournalGroup = {
	topic: mockSubscribeParams.topic,
	service: mockSubscribeParams.serviceIdentity.serviceName,
};

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
	await Promise.all(
		clients.map((client) =>
			client.status === "end" ? undefined : client.quit()
		)
	);
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
						insert: jest.fn(async (..._args: any[]) => undefined),
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
		after.worker.start();
		const deadline = Date.now() + 5000;
		while (after.http.post.mock.calls.length === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		await after.worker.stop();

		expect(after.http.post).toHaveBeenCalledTimes(1);
		const body = after.http.post.mock.calls[0]?.[1] as {
			metadata: { messageId: string };
		};
		expect(body.metadata.messageId).toBe(messageId);
	});

	it("should measure the backlog of a group that does not read", async () => {
		const journal = journalOn(replica());
		await journal.append(createMockMessage("m1"), [GROUP.service, "reader"]);
		await journal.append(createMockMessage("m2"), [GROUP.service, "reader"]);
		await journal.readNew({ ...GROUP, service: "reader" }, "r", 10);
		const [one] = await journal.readNew(GROUP, "a", 1);
		await journal.ack(GROUP, one?.id as string);

		const lags = await journal.lag();

		const of = (service: string) => lags.find((l) => l.service === service);
		expect(of(GROUP.service)?.pending).toBe(1);
		expect(of("reader")?.pending).toBe(2);
		expect(of(GROUP.service)?.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
	});
});

describe("subscription expired while the group exists — real Redis", () => {
	it("delivers the message published meanwhile once, after the service subscribes again", async () => {
		const journal = journalOn(replica());
		await journal.register(GROUP);
		const registry = new SubscriptionRegistry(
			new InMemorySubscriptionStore(),
			journal
		);
		const dispatcher = new Dispatcher({ registry, journal });

		await dispatcher.publish({ price: 1 }, metadata);
		await dispatcher.subscribe(mockSubscribeParams);

		const entries = await journal.readNew(GROUP, "c1", 10);
		expect(entries).toHaveLength(1);
		await journal.ack(GROUP, entries[0]?.id as string);
		expect(await journal.readNew(GROUP, "c1", 10)).toHaveLength(0);
	});
});
