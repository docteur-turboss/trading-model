import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADD = jest.fn();
const MOCK_LIST = jest.fn();
const MOCK_DELETE = jest.fn();
const MOCK_COUNT = jest.fn();
const MOCK_PRUNE = jest.fn();
const MOCK_CLAIM_ENTRIES_FOR_RETRY = jest.fn();
const MOCK_RELEASE_STALE_CLAIMS = jest.fn();
const MOCK_LIST_QUEUABLE = jest.fn();
const MOCK_MARK_RETRIED = jest.fn();
const MOCK_ABANDON_EXHAUSTED = jest.fn();
const MOCK_RELEASE_CLAIM_WITHOUT_COUNT = jest.fn();
const MOCK_RELEASE_ALL_CLAIMS = jest.fn();
const MOCK_RELEASE_CLAIMS_BY_INSTANCE = jest.fn();

jest.mock("../../src/dlq/repository", () => ({
	DlqCapacityError: class DlqCapacityError extends Error {},
	dlqRepository: {
		add: MOCK_ADD,
		list: MOCK_LIST,
		delete: MOCK_DELETE,
		count: MOCK_COUNT,
		prune: MOCK_PRUNE,
		listQueuable: MOCK_LIST_QUEUABLE,
	},
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: MOCK_CLAIM_ENTRIES_FOR_RETRY,
		releaseStaleClaims: MOCK_RELEASE_STALE_CLAIMS,
		releaseClaimWithoutCount: MOCK_RELEASE_CLAIM_WITHOUT_COUNT,
		releaseAllActiveClaims: MOCK_RELEASE_ALL_CLAIMS,
		releaseClaimsByInstance: MOCK_RELEASE_CLAIMS_BY_INSTANCE,
	},
}));

jest.mock("../../src/dlq/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: MOCK_MARK_RETRIED,
		abandonExhaustedEntries: MOCK_ABANDON_EXHAUSTED,
	},
}));

jest.mock("../../src/config/env", () => ({
	env: {
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
	getCollection: jest.fn(),
	getMissingCriticalIndexes: () => [],
}));

jest.mock("../../src/config/address-manager", () => ({
	findAService: jest.fn(),
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/audit", () => ({
	notifyAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		push: jest.fn(() => Promise.resolve(true)),
		pop: jest.fn(() => Promise.resolve(null)),
		isAvailable: jest.fn(() => true),
		connect: jest.fn(() => Promise.resolve(true)),
		close: jest.fn(() => Promise.resolve()),
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesAdded: { inc: jest.fn() },
		entriesDeleted: { inc: jest.fn() },
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
		entriesPruned: { inc: jest.fn() },
		pruneErrors: { inc: jest.fn() },
		entrySizeBytes: { observe: jest.fn() },
		collectionSize: { set: jest.fn() },
	},
}));

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, statusCode: number) => ({ data, statusCode }),
}));

const MOCK_HTTP_POST = jest.fn();
jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: jest.fn().mockImplementation(() => ({
		post: MOCK_HTTP_POST,
	})),
}));

describe("Controller - Auto Retry", () => {
	let controller: Record<string, unknown>;

	beforeAll(() => {
		controller = jest.requireActual("../../src/dlq/controller") as Record<
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
			expect(MOCK_CLAIM_ENTRIES_FOR_RETRY).toHaveBeenCalledWith(
				50,
				expect.stringContaining("auto-retry-"),
				"test-dlq-1"
			);
		});
	});

	describe("startAutoRetry / stopAutoRetry", () => {
		afterEach(() => {
			(controller.stopAutoRetry as () => void)();
		});

		it("should start and stop auto-retry timers", () => {
			(controller.startAutoRetry as () => void)();
			(controller.stopAutoRetry as () => void)();
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
