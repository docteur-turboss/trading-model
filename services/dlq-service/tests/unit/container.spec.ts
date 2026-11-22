import { describe, expect, it, jest } from "@jest/globals";

const MOCK_SET_SHUTTING_DOWN = jest.fn<(...args: any[]) => any>();
const MOCK_CONNECT_REDIS_QUEUE = jest.fn<(...args: any[]) => any>();
const MOCK_PUSH_REDIS_QUEUE = jest.fn<(...args: any[]) => any>();
const MOCK_CLOSE_REDIS_QUEUE = jest.fn<(...args: any[]) => any>();
const MOCK_CLOSE_HTTP_CLIENT = jest.fn<(...args: any[]) => any>();
const MOCK_AUTO_RETRY_START = jest.fn<(...args: any[]) => any>();
const MOCK_AUTO_RETRY_STOP = jest.fn<(...args: any[]) => any>();
const MOCK_PRUNE_START = jest.fn<(...args: any[]) => any>();
const MOCK_PRUNE_STOP = jest.fn<(...args: any[]) => any>();
const MOCK_DRAIN = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_OWN = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_STALE = jest.fn<(...args: any[]) => any>();
const MOCK_MONGO_CTOR = jest.fn<(...args: any[]) => any>();
const MOCK_STATE = { connected: true, missing: [] as string[] };
const MOCK_GET_DB = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		DLQ_AUTO_RETRY_LIMIT: 50,
		INSTANCE_ID: "dlq-1",
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	AddressManager: {},
	FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		close: MOCK_CLOSE_REDIS_QUEUE,
		connect: MOCK_CONNECT_REDIS_QUEUE,
		push: MOCK_PUSH_REDIS_QUEUE,
	},
}));

jest.mock("../../src/config/mongo-connection-manager", () => ({
	MongoConnectionManager: jest.fn((...args: any[]) => {
		MOCK_MONGO_CTOR(...args);
		return {
			getDb: MOCK_GET_DB,
			isConnected: () => MOCK_STATE.connected,
			getMissingCriticalIndexes: () => MOCK_STATE.missing,
		};
	}),
}));

jest.mock("../../src/infrastructure/auto-retry-scheduler", () => ({
	createAutoRetryScheduler: () => ({
		start: MOCK_AUTO_RETRY_START,
		stop: MOCK_AUTO_RETRY_STOP,
	}),
}));

jest.mock("../../src/infrastructure/dlq-pruner", () => ({
	DlqPruner: jest.fn((..._args: any[]) => ({
		start: MOCK_PRUNE_START,
		stop: MOCK_PRUNE_STOP,
	})),
}));

jest.mock("../../src/application/services/claim-release-service", () => ({
	ClaimReleaseService: jest.fn((..._args: any[]) => ({
		releaseStale: MOCK_RELEASE_STALE,
		releaseOwn: MOCK_RELEASE_OWN,
	})),
}));

jest.mock("../../src/application/services/replay-drain-service", () => ({
	ReplayDrainService: jest.fn((..._args: any[]) => ({ drain: MOCK_DRAIN })),
}));

jest.mock("../../src/adapters/outbound/http-client-manager", () => ({
	closeHttpClient: MOCK_CLOSE_HTTP_CLIENT,
	getHttpClient: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/shared/shutdown-flag", () => ({
	setShuttingDown: MOCK_SET_SHUTTING_DOWN,
	isShuttingDown: () => false,
}));

const ENV = {
	MONGO_URI: "mongodb://localhost:27017",
	MONGO_DB: "test",
	MONGO_COLLECTION: "dlq",
	INSTANCE_ID: "dlq-1",
	DLQ_AUTO_RETRY_ENABLED: true,
	DLQ_AUTO_RETRY_LIMIT: 50,
} as never;

function build() {
	const { createDlqApp } = jest.requireActual(
		"../../src/config/container"
	) as typeof import("../../src/config/container");
	return createDlqApp(ENV);
}

describe("createDlqApp", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("builds nothing until it is called", () => {
		jest.requireActual("../../src/config/container");
		expect(MOCK_MONGO_CTOR).not.toHaveBeenCalled();

		build();

		expect(MOCK_MONGO_CTOR).toHaveBeenCalledWith(ENV);
	});

	it("exposes the HTTP handlers", () => {
		const app = build();
		for (const name of [
			"deleteEntries",
			"listEntries",
			"replayEntries",
			"healthCheck",
		] as const) {
			expect(typeof app.handlers[name]).toBe("function");
		}
	});

	it.each([
		[true, [], true],
		[false, [], false],
		[true, ["a"], false],
	])(
		"mongo readiness (connected %s, missing %j) is %s",
		(connected, missing, ready) => {
			Object.assign(MOCK_STATE, { connected, missing });
			expect(build().mongoReadiness.check()).toBe(ready);
			Object.assign(MOCK_STATE, { connected: true, missing: [] });
		}
	);

	it("connects the database", async () => {
		await build().connectDb();
		expect(MOCK_GET_DB).toHaveBeenCalled();
	});

	it("releases stale claims through the claim release service", async () => {
		MOCK_RELEASE_STALE.mockResolvedValue(undefined);
		await build().releaseStaleClaims(60000);
		expect(MOCK_RELEASE_STALE).toHaveBeenCalledWith(60000);
	});

	it("starts the prune and the auto-retry", () => {
		build().start();
		expect(MOCK_PRUNE_START).toHaveBeenCalled();
		expect(MOCK_AUTO_RETRY_START).toHaveBeenCalled();
		expect(MOCK_CONNECT_REDIS_QUEUE).not.toHaveBeenCalled();
		expect(MOCK_PUSH_REDIS_QUEUE).not.toHaveBeenCalled();
	});

	it("shuts down: timers, drain, claims, then resources", async () => {
		MOCK_CLOSE_REDIS_QUEUE.mockResolvedValue(undefined);
		MOCK_CLOSE_HTTP_CLIENT.mockResolvedValue(undefined);
		MOCK_DRAIN.mockResolvedValue(true);
		MOCK_RELEASE_OWN.mockResolvedValue(undefined);

		await build().shutdownSchedulers();

		expect(MOCK_SET_SHUTTING_DOWN).toHaveBeenCalledWith(true);
		expect(MOCK_PRUNE_STOP).toHaveBeenCalled();
		expect(MOCK_AUTO_RETRY_STOP).toHaveBeenCalled();
		expect(MOCK_DRAIN).toHaveBeenCalled();
		expect(MOCK_RELEASE_OWN).toHaveBeenCalled();
		expect(MOCK_CLOSE_REDIS_QUEUE).toHaveBeenCalled();
		expect(MOCK_CLOSE_HTTP_CLIENT).toHaveBeenCalled();
	});

	it("keeps the claims of replays still in flight", async () => {
		MOCK_DRAIN.mockResolvedValue(false);

		await build().shutdownSchedulers();

		expect(MOCK_RELEASE_OWN).not.toHaveBeenCalled();
		expect(MOCK_CLOSE_HTTP_CLIENT).toHaveBeenCalled();
	});
});
