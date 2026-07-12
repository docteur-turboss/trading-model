import { describe, expect, it, jest } from "@jest/globals";

const mockInsert = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();
const mockCount = jest.fn();
const mockPrune = jest.fn();
const mockQueryQueuable = jest.fn();

jest.mock("../../src/dlq/repository", () => ({
	dlqRepository: {
		insert: mockInsert,
		query: mockQuery,
		delete: mockDelete,
		count: mockCount,
		prune: mockPrune,
		listQueuable: mockQueryQueuable,
	},
}));

const mockClaimEntriesForRetry = jest.fn();
const mockReleaseStaleClaims = jest.fn();
const mockClaimEntry = jest.fn();
const mockIncrementRetryCount = jest.fn();

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: mockClaimEntriesForRetry,
		releaseStaleClaims: mockReleaseStaleClaims,
		claimEntry: mockClaimEntry,
		incrementRetryCount: mockIncrementRetryCount,
		releaseClaimWithoutCount: jest.fn(),
		releaseAllActiveClaims: jest.fn(),
		releaseClaimsByInstance: jest.fn(),
	},
}));

jest.mock("../../src/dlq/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: jest.fn(),
		abandonExhaustedEntries: jest.fn(),
	},
}));

jest.mock("../../src/config/env", () => ({
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
		DLQ_AUTO_RETRY_ENABLED: false,
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
	FIND_A_SERVICE: jest.fn(),
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
	catchSync: (fn: (...args: never[]) => unknown) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, statusCode: number) => ({ data, statusCode }),
	HEALTH_STATUS_OK: "ok",
}));

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: jest.fn().mockImplementation(() => ({
		post: jest.fn(),
	})),
}));

interface MockReq {
	body?: unknown;
	query?: Record<string, string>;
}

describe("DLQ Controller", () => {
	let controller: {
		AddEntry: (
			req: MockReq
		) => Promise<{ statusCode: number; data?: Record<string, unknown> }>;
		ListEntries: (
			req: MockReq
		) => Promise<{ statusCode: number; data?: Record<string, unknown> }>;
		DeleteEntries: (
			req: MockReq
		) => Promise<{ statusCode: number; data?: Record<string, unknown> }>;
		HealthCheck: (
			req: MockReq
		) => Promise<{ statusCode: number; data?: Record<string, unknown> }>;
		ReadyCheck: (
			req: MockReq
		) => Promise<{ statusCode: number; data?: Record<string, unknown> }>;
	};

	beforeAll(() => {
		controller = jest.requireActual("../../src/dlq/controller");
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("AddEntry", () => {
		it("should return 201 with id on valid entry", () => {
			mockInsert.mockResolvedValueOnce("entry-1");

			const req = {
				body: {
					topic: "test.event",
					message: { data: 1 },
					deliveryAttempt: 1,
					timestamp: new Date().toISOString(),
				},
			};
			return controller
				.AddEntry(req as MockReq)
				.then((result: { statusCode: number; data: { id: string } }) => {
					expect(result.statusCode).toBe(201);
					expect(result.data).toEqual({ id: "entry-1" });
				});
		});

		it("should return 400 on invalid entry", () => {
			const req = { body: { message: "invalid" } };
			return controller
				.AddEntry(req as MockReq)
				.then((result: { statusCode: number }) => {
					expect(result.statusCode).toBe(400);
				});
		});
	});

	describe("ListEntries", () => {
		it("should return paginated entries with offset", () => {
			mockQuery.mockResolvedValueOnce([{ id: "1", topic: "t1" }]);

			const req = { query: { limit: "10", offset: "0" } };
			return controller
				.ListEntries(req as unknown as MockReq)
				.then(
					(result: {
						statusCode: number;
						data: { entries: unknown[]; hasMore: boolean };
					}) => {
						expect(result.statusCode).toBe(200);
						expect(result.data.entries).toHaveLength(1);
						expect(result.data.entries[0]).toMatchObject({ id: "1" });
						expect(result.data.hasMore).toBe(false);
					}
				);
		});

		it("should support cursor-based pagination", () => {
			mockQuery.mockResolvedValueOnce([
				{ id: "5", topic: "t1" },
				{ id: "4", topic: "t1" },
			]);

			const req = { query: { limit: "2", cursor: "abc" } };
			return controller
				.ListEntries(req as unknown as MockReq)
				.then(
					(result: {
						statusCode: number;
						data: { cursor?: string; hasMore: boolean };
					}) => {
						expect(result.statusCode).toBe(200);
						expect(result.data.cursor).toBe("4");
						expect(result.data).not.toHaveProperty("offset");
						expect(result.data.hasMore).toBe(true);
					}
				);
		});
	});

	describe("DeleteEntries", () => {
		it("should return deleted count on valid ids", () => {
			mockDelete.mockResolvedValueOnce(2);

			const req = { body: { ids: ["a", "b"] } };
			return controller
				.DeleteEntries(req as MockReq)
				.then((result: { statusCode: number; data: { deleted: number } }) => {
					expect(result.statusCode).toBe(200);
					expect(result.data.deleted).toBe(2);
				});
		});

		it("should return 400 on empty ids", () => {
			const req = { body: { ids: [] } };
			return controller
				.DeleteEntries(req as MockReq)
				.then((result: { statusCode: number }) => {
					expect(result.statusCode).toBe(400);
				});
		});
	});

	describe("HealthCheck", () => {
		it("should return status ok with entry count", () => {
			mockCount.mockResolvedValueOnce(5);

			return controller
				.HealthCheck({} as MockReq)
				.then(
					(result: {
						statusCode: number;
						data: { status: string; entries: number };
					}) => {
						expect(result.statusCode).toBe(200);
						expect(result.data).toEqual({ status: "ok", entries: 5 });
					}
				);
		});
	});

	describe("ReadyCheck", () => {
		it("should return ready when db and redis are connected", () => {
			mockCount.mockResolvedValueOnce(10);

			return controller
				.ReadyCheck({} as MockReq)
				.then(
					(result: {
						statusCode: number;
						data: { status: string; redis: string };
					}) => {
						expect(result.statusCode).toBe(200);
						expect(result.data.status).toBe("ready");
						expect(result.data.redis).toBe("connected");
					}
				);
		});
	});
});
