import { describe, expect, it, jest } from "@jest/globals";

const MOCK_RELEASE_CLAIMS = jest.fn();
const MOCK_RELEASE_STALE = jest.fn();
const MOCK_LIST_QUEUABLE = jest.fn();
const MOCK_PUSH = jest.fn();
const MOCK_IS_AVAILABLE = jest.fn();

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		releaseClaimsByInstance: MOCK_RELEASE_CLAIMS,
		releaseStaleClaims: MOCK_RELEASE_STALE,
	},
}));

jest.mock("../../src/dlq/repository", () => ({
	dlqRepository: { listQueuable: MOCK_LIST_QUEUABLE },
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { push: MOCK_PUSH, isAvailable: MOCK_IS_AVAILABLE },
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		INSTANCE_ID: "test-instance",
		MONGO_URI: "mongodb://localhost:27017",
		MONGO_DB: "test",
		MONGO_COLLECTION: "dlq",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
		MESSAGE_MANAGER_URL: "",
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("ClaimReleaseService", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("releaseAndRequeue", () => {
		it("should release claims and requeue entries", async () => {
			MOCK_RELEASE_CLAIMS.mockResolvedValue(2);
			MOCK_IS_AVAILABLE.mockReturnValue(true);
			MOCK_LIST_QUEUABLE.mockResolvedValue(["id1", "id2"]);
			MOCK_PUSH.mockResolvedValue(true);

			const { ClaimReleaseService } = jest.requireActual(
				"../../src/dlq/claim-release-service"
			) as {
				ClaimReleaseService: new () => {
					releaseAndRequeue: () => Promise<void>;
					releaseStale: (ms?: number) => Promise<void>;
				};
			};
			const svc = new ClaimReleaseService();
			await svc.releaseAndRequeue();

			expect(MOCK_RELEASE_CLAIMS).toHaveBeenCalledWith(
				expect.stringContaining("test-instance")
			);
			expect(MOCK_PUSH).toHaveBeenCalledTimes(2);
		});

		it("should not requeue when queue is unavailable", async () => {
			MOCK_RELEASE_CLAIMS.mockResolvedValue(2);
			MOCK_IS_AVAILABLE.mockReturnValue(false);

			const { ClaimReleaseService } = jest.requireActual(
				"../../src/dlq/claim-release-service"
			) as {
				ClaimReleaseService: new () => {
					releaseAndRequeue: () => Promise<void>;
					releaseStale: (ms?: number) => Promise<void>;
				};
			};
			const svc = new ClaimReleaseService();
			await svc.releaseAndRequeue();

			expect(MOCK_PUSH).not.toHaveBeenCalled();
		});

		it("should not requeue when released count is 0", async () => {
			MOCK_RELEASE_CLAIMS.mockResolvedValue(0);

			const { ClaimReleaseService } = jest.requireActual(
				"../../src/dlq/claim-release-service"
			) as {
				ClaimReleaseService: new () => {
					releaseAndRequeue: () => Promise<void>;
					releaseStale: (ms?: number) => Promise<void>;
				};
			};
			const svc = new ClaimReleaseService();
			await svc.releaseAndRequeue();

			expect(MOCK_PUSH).not.toHaveBeenCalled();
		});
	});

	describe("releaseStale", () => {
		it("should release stale claims", async () => {
			MOCK_RELEASE_STALE.mockResolvedValue(3);

			const { ClaimReleaseService } = jest.requireActual(
				"../../src/dlq/claim-release-service"
			) as {
				ClaimReleaseService: new () => {
					releaseAndRequeue: () => Promise<void>;
					releaseStale: (ms?: number) => Promise<void>;
				};
			};
			const svc = new ClaimReleaseService();
			await svc.releaseStale(30000);

			expect(MOCK_RELEASE_STALE).toHaveBeenCalledWith(30000);
		});

		it("should skip logging when no stale claims", async () => {
			MOCK_RELEASE_STALE.mockResolvedValue(0);

			const { ClaimReleaseService } = jest.requireActual(
				"../../src/dlq/claim-release-service"
			) as {
				ClaimReleaseService: new () => {
					releaseAndRequeue: () => Promise<void>;
					releaseStale: (ms?: number) => Promise<void>;
				};
			};
			const svc = new ClaimReleaseService();
			await svc.releaseStale();

			expect(MOCK_RELEASE_STALE).toHaveBeenCalled();
		});
	});
});
