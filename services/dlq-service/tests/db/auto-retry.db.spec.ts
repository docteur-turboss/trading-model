import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

/**
 * Automatic replay of dead letters (DLQ_AUTO_RETRY_ENABLED, on in compose and
 * K8s since ADR-0029) against real MongoDB and Redis. Only the mTLS hop to
 * message-manager is replaced: the E2E stack keeps auto-retry off, because its
 * suites replay by hand and would race it.
 */
const MESSAGE_MANAGER = "https://message-manager:3000";
process.env.MESSAGE_MANAGER_URL = MESSAGE_MANAGER;
process.env.DLQ_AUTO_RETRY_ENABLED = "true";
process.env.DLQ_RETRY_MAX_ATTEMPTS = "2";

const delivered: Array<{ url: string; body: unknown }> = [];
let failDelivery = false;
const fakeClient = {
	post: jest.fn(async (url: string, body: unknown) => {
		if (failDelivery) {
			throw new Error("message-manager unavailable");
		}
		delivered.push({ url, body });
		return { status: 200 };
	}),
};

jest.mock("../../src/adapters/outbound/http-client-manager", () => ({
	getHttpClient: () => Promise.resolve(fakeClient),
	reloadHttpClientTls: () => Promise.resolve(),
	closeHttpClient: () => Promise.resolve(),
}));
jest.mock("../../src/adapters/outbound/audit-notifier", () => ({
	notifyAddAudit: jest.fn(),
	notifyReplayAudit: jest.fn(),
	notifyDeleteAudit: jest.fn(),
}));
jest.mock("../../src/config/address-manager", () => ({
	AddressManager: {},
	FIND_A_SERVICE: jest.fn(),
}));

import {
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";

type Modules = {
	dlqRepository: typeof import("../../src/adapters/outbound/repository").dlqRepository;
	DlqStatus: typeof import("../../src/adapters/outbound/repository").DlqStatus;
	getCollection: typeof import("../../src/config/db").getCollection;
	closeDb: typeof import("../../src/config/db").closeDb;
	dlqRedisQueue: typeof import("../../src/config/redis-queue").dlqRedisQueue;
	autoRetryTick: typeof import("../../src/shared/auto-retry").autoRetryTick;
	rebuildQueueFromMongo: typeof import("../../src/shared/auto-retry").rebuildQueueFromMongo;
	processRedisQueue: typeof import("../../src/shared/auto-retry").processRedisQueue;
};
let m: Modules;

function seed(orderId: string): Promise<string> {
	return m.dlqRepository.insert({
		topic: Topic.of("orders"),
		message: { orderId },
		reason: "delivery failed",
		deliveryAttempt: PositiveInt.of(1),
		timestamp: UnixTimestamp.now(),
	});
}

async function entry(id: string) {
	return (await m.getCollection()).findOne({ _id: new ObjectId(id) });
}

beforeAll(async () => {
	m = {
		...require("../../src/adapters/outbound/repository"),
		...require("../../src/config/db"),
		...require("../../src/config/redis-queue"),
		...require("../../src/shared/auto-retry"),
	};
	await expect(m.dlqRedisQueue.connect()).resolves.toBe(true);
});

beforeEach(async () => {
	await (await m.getCollection()).deleteMany({});
	while ((await m.dlqRedisQueue.pop()) !== null) {
		// drain what a previous case left
	}
	delivered.length = 0;
	failDelivery = false;
	fakeClient.post.mockClear();
});

afterAll(async () => {
	await m.dlqRedisQueue.close();
	await m.closeDb();
});

describe("DLQ auto-retry — real MongoDB and Redis", () => {
	it("replays a stored dead letter to message-manager and completes it", async () => {
		const id = await seed("o-1");

		await m.autoRetryTick();

		expect(delivered).toEqual([
			{ url: `${MESSAGE_MANAGER}/message`, body: { orderId: "o-1" } },
		]);
		const doc = await entry(id);
		expect(doc?.status).toBe(m.DlqStatus.Completed);
		expect(doc?.processingAt).toBeUndefined();
	});

	it("keeps a failed replay for the next tick, then abandons it after the max attempts", async () => {
		const id = await seed("o-2");
		failDelivery = true;

		await m.autoRetryTick();

		const afterFirst = await entry(id);
		expect(afterFirst?.retryCount).toBe(1);
		expect(afterFirst?.processingAt).toBeUndefined();
		expect(afterFirst?.status).not.toBe(m.DlqStatus.Completed);

		await m.autoRetryTick();
		await m.autoRetryTick();

		expect((await entry(id))?.status).toBe(m.DlqStatus.Abandoned);
		expect(fakeClient.post).toHaveBeenCalledTimes(2);
	});

	it("replays through the Redis worker loop what the queue rebuild pushed", async () => {
		const id = await seed("o-3");

		await m.rebuildQueueFromMongo();
		await m.processRedisQueue();

		expect(delivered.map((d) => d.body)).toEqual([{ orderId: "o-3" }]);
		expect((await entry(id))?.status).toBe(m.DlqStatus.Completed);
	});
});
