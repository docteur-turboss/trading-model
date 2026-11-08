import { describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT = jest.fn<(...args: any[]) => any>();
const MOCK_QUERY = jest.fn<(...args: any[]) => any>();
const MOCK_DELETE = jest.fn<(...args: any[]) => any>();
const MOCK_COUNT = jest.fn<(...args: any[]) => any>();
const MOCK_PRUNE = jest.fn<(...args: any[]) => any>();
const MOCK_CLAIM_ENTRIES_FOR_RETRY = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_STALE_CLAIMS = jest.fn<(...args: any[]) => any>();
const MOCK_LIST_QUEUABLE = jest.fn<(...args: any[]) => any>();
const MOCK_MARK_RETRIED = jest.fn<(...args: any[]) => any>();
const MOCK_ABANDON_EXHAUSTED = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_CLAIM_WITHOUT_COUNT = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_CLAIMS_BY_INSTANCE = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/outbound/repository", () => ({
	dlqRepository: {
		insert: MOCK_INSERT,
		query: MOCK_QUERY,
		delete: MOCK_DELETE,
		count: MOCK_COUNT,
		prune: MOCK_PRUNE,
		listQueuable: MOCK_LIST_QUEUABLE,
	},
}));

jest.mock("../../src/adapters/outbound/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: MOCK_CLAIM_ENTRIES_FOR_RETRY,
	},
	claimReleaseManager: {
		releaseStaleClaims: MOCK_RELEASE_STALE_CLAIMS,
		releaseClaimWithoutCount: MOCK_RELEASE_CLAIM_WITHOUT_COUNT,
		releaseClaimsByInstance: MOCK_RELEASE_CLAIMS_BY_INSTANCE,
	},
}));

jest.mock("../../src/adapters/outbound/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: MOCK_MARK_RETRIED,
		abandonExhaustedEntries: MOCK_ABANDON_EXHAUSTED,
	},
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		DLQ_AUTO_RETRY_LIMIT: 50,
		INSTANCE_ID: "test-dlq-1",
	},
}));

jest.mock("../../src/config/db", () => ({
	isDbConnected: () => true,
	getCollection: jest.fn<(...args: any[]) => any>(),
	getMissingCriticalIndexes: () => [],
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/config/audit", () => ({
	publishDlqEvent: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		push: jest.fn((..._args: any[]) => Promise.resolve(true)),
		pop: jest.fn((..._args: any[]) => Promise.resolve(null)),
		isAvailable: jest.fn((..._args: any[]) => true),
		connect: jest.fn((..._args: any[]) => Promise.resolve(true)),
		close: jest.fn((..._args: any[]) => Promise.resolve()),
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesAdded: { inc: jest.fn<(...args: any[]) => any>() },
		entriesDeleted: { inc: jest.fn<(...args: any[]) => any>() },
		entriesReplayed: { inc: jest.fn<(...args: any[]) => any>() },
		entriesReplayFailed: { inc: jest.fn<(...args: any[]) => any>() },
		entriesPruned: { inc: jest.fn<(...args: any[]) => any>() },
		pruneErrors: { inc: jest.fn<(...args: any[]) => any>() },
		entrySizeBytes: { observe: jest.fn<(...args: any[]) => any>() },
		collectionSize: { set: jest.fn<(...args: any[]) => any>() },
	},
}));

jest.mock("@trading-model/http/adapters/inbound/catch-error", () => ({
	catchSync: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => ({
	sendResponse: (data: unknown, statusCode: number) => ({ data, statusCode }),
}));

const MOCK_HTTP_POST = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		post: MOCK_HTTP_POST,
	})),
}));

describe("Controller - Auto Retry", () => {
	let controller: Record<string, unknown>;
	let scheduler: typeof import("../../src/infrastructure/auto-retry-scheduler");

	beforeAll(() => {
		scheduler = jest.requireActual(
			"../../src/infrastructure/auto-retry-scheduler"
		);
		controller = jest.requireActual("../../src/config/container") as Record<
			string,
			unknown
		>;
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("autoRetryTick (enabled)", () => {
		beforeEach(() => {
			jest.clearAllMocks();
		});

		it("should skip auto-retry when no entries available", async () => {
			MOCK_RELEASE_STALE_CLAIMS.mockResolvedValue(0);
			MOCK_CLAIM_ENTRIES_FOR_RETRY.mockResolvedValue([]);

			await (controller.autoRetryTick as () => Promise<void>)();
			expect(MOCK_RELEASE_STALE_CLAIMS).toHaveBeenCalled();
			expect(MOCK_CLAIM_ENTRIES_FOR_RETRY).toHaveBeenCalledWith({
				limit: 50,
				batchId: expect.stringContaining("auto-retry-"),
				instanceId: "test-dlq-1",
			});
		});
	});

	describe("startAutoRetry / stopAutoRetry", () => {
		afterEach(() => {
			scheduler.stopAutoRetry();
		});

		it("should start and stop auto-retry timers", () => {
			scheduler.startAutoRetry();
			scheduler.stopAutoRetry();
		});
	});

	describe("rebuildQueueFromMongo", () => {
		it("should push queuable entries to Redis", async () => {
			MOCK_LIST_QUEUABLE.mockResolvedValue(["id1", "id2"]);
			await (controller.rebuildQueueFromMongo as () => Promise<void>)();
			expect(MOCK_LIST_QUEUABLE).toHaveBeenCalled();
		});
	});
});
