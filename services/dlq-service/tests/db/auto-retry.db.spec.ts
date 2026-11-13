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
	closeHttpClient: () => Promise.resolve(),
}));
jest.mock("../../src/adapters/outbound/audit-notifier", () => ({
	notifyAddAudit: jest.fn<(...args: any[]) => any>(),
	notifyReplayAudit: jest.fn<(...args: any[]) => any>(),
	notifyDeleteAudit: jest.fn<(...args: any[]) => any>(),
}));
jest.mock("../../src/config/address-manager", () => ({
	AddressManager: {},
	FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
}));

import {
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";

interface Modules {
	/** Seeds and inspects the collection, through its own connection. */
	dlqRepository: import("../../src/adapters/outbound/repository").DlqRepository;
	getCollection: () => Promise<import("mongodb").Collection>;
	mongo: import("../../src/config/mongo-connection-manager").MongoConnectionManager;
	DlqStatus: typeof import("../../src/adapters/outbound/repository").DlqStatus;
	dlqRedisQueue: typeof import("../../src/config/redis-queue").dlqRedisQueue;
	app: import("../../src/config/container").DlqApp;
}
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
	const { ENV } = require("../../src/infrastructure/config/env");
	const {
		MongoConnectionManager,
	} = require("../../src/config/mongo-connection-manager");
	const {
		DlqRepository,
		DlqStatus,
	} = require("../../src/adapters/outbound/repository");
	const { createDlqApp } = require("../../src/config/container");
	const mongo = new MongoConnectionManager(ENV);
	const getCollection = () => mongo.getCollection();
	m = {
		dlqRepository: new DlqRepository(getCollection),
		getCollection,
		mongo,
		DlqStatus,
		dlqRedisQueue: require("../../src/config/redis-queue").dlqRedisQueue,
		app: createDlqApp(ENV),
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
	await m.app.closeDb();
	await m.mongo.close();
});

describe("DLQ auto-retry — real MongoDB and Redis", () => {
	it("replays a stored dead letter to message-manager and completes it", async () => {
		const id = await seed("o-1");

		await m.app.jobs.autoRetryTick();

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

		await m.app.jobs.autoRetryTick();

		const afterFirst = await entry(id);
		expect(afterFirst?.retryCount).toBe(1);
		expect(afterFirst?.processingAt).toBeUndefined();
		expect(afterFirst?.status).not.toBe(m.DlqStatus.Completed);

		await m.app.jobs.autoRetryTick();
		await m.app.jobs.autoRetryTick();

		expect((await entry(id))?.status).toBe(m.DlqStatus.Abandoned);
		expect(fakeClient.post).toHaveBeenCalledTimes(2);
	});

	it("replays through the Redis worker loop what the queue rebuild pushed", async () => {
		const id = await seed("o-3");

		await m.app.jobs.rebuildQueueFromMongo();
		await m.app.jobs.processRedisQueue();

		expect(delivered.map((d) => d.body)).toEqual([{ orderId: "o-3" }]);
		expect((await entry(id))?.status).toBe(m.DlqStatus.Completed);
	});
});
