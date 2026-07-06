import { describe, expect, it, jest } from "@jest/globals";

jest.mock("express-rate-limit", () => {
	return () => {
		const fn: Record<string, unknown> = (() => {}) as unknown as Record<
			string,
			unknown
		>;
		fn.resetKey = jest.fn();
		return fn as ReturnType<typeof import("express-rate-limit")>;
	};
});

jest.mock("rate-limit-redis", () => {
	return jest.fn();
});

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: jest.fn(),
}));

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: (...args: never[]) => unknown) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown) => data,
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/audit", () => ({
	notifyAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../src/config/db", () => ({
	isDbConnected: () => true,
	getCollection: jest.fn(),
	getMissingCriticalIndexes: () => [],
}));

jest.mock("../../src/dlq/repository", () => ({
	DlqCapacityError: class DlqCapacityError {
		constructor(public readonly message: string) {}
		public name = "DlqCapacityError";
	},
	dlqRepository: {
		add: jest.fn(),
		list: jest.fn(),
		delete: jest.fn(),
		count: jest.fn(),
		prune: jest.fn(),
		listQueuable: jest.fn(),
	},
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: jest.fn(),
		releaseStaleClaims: jest.fn(),
		releaseClaimWithoutCount: jest.fn(),
		incrementRetryCount: jest.fn(),
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

jest.mock("../../src/config/address-manager", () => ({
	findAService: jest.fn(),
	AddressManager: { start: jest.fn() },
}));

jest.mock("../../src/config/env", () => ({
	env: {
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		MAX_ENTRIES: 100,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		MONGO_URI: "mongodb://localhost:27017/test",
		MONGO_DB: "test",
		MONGO_COLLECTION: "test_collection",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		REDIS_URL: "",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: false,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		DLQ_AUTO_RETRY_LIMIT: 50,
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metricsHandler: jest.fn(),
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

jest.mock("@trading-model/common/validation/env", () => {
	const actual = jest.requireActual("@trading-model/common/validation/env");
	return {
		...actual,
		validateEnv: (schema: unknown) => {
			const result = (schema as { parse: (...args: never[]) => unknown }).parse(
				{
					APP_NAME: "dlq-service:test",
					APP_VERSION: "1.0.0",
					PORT: 0,
					SERVICE_NAME: "dlq-service",
					TLS_KEY_PATH: "",
					TLS_CERT_PATH: "",
					TLS_CA_PATH: "",
					CERT_CLIENT_CA_URL: "",
					CERT_CLIENT_SERVICE_ID: "",
					CERT_CLIENT_SANS: "",
					CERT_CLIENT_BOOTSTRAP_TOKEN: "",
					CA_CLIENT_TLS_KEY: "",
					CA_CLIENT_TLS_CERT: "",
					CA_CLIENT_TLS_CA: "",
					ADDRESS_MANAGER_URL: "https://localhost:8443",
					CACHE_TTL_MS: 84000000,
					SERVICE_PING_TIMEOUT_MS: 84000000,
					TOKEN_REFRESH_INTERVAL_MS: 84000000,
					TTL_REFRESH_INTERVAL_MS: 84000000,
					MESSAGE_BUS_INIT_TIMEOUT_MS: 5000,
					MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: 5000,
					MESSAGE_CALLBACK_PATH: "message",
					MONGO_URI: "mongodb://localhost:27017/test",
					MONGO_DB: "test",
					MONGO_COLLECTION: "test",
					MAX_ENTRIES: 100,
					DLQ_RETRY_MAX_ATTEMPTS: 3,
					MESSAGE_MANAGER_URL: "https://message-manager:3000",
					DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
					DLQ_ALLOWED_SERVICES: "message-manager,admin",
					REDIS_URL: "",
					DLQ_PRUNE_INTERVAL_MS: 60000,
					DLQ_AUTO_RETRY_ENABLED: false,
					DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
					DLQ_AUTO_RETRY_LIMIT: 50,
					INSTANCE_ID: "test-dlq-1",
				}
			);
			return result;
		},
	};
});

describe("DLQ Routes", () => {
	let DlqRoutes: () => ReturnType<typeof import("express").Router>;

	beforeAll(() => {
		const routes = jest.requireActual("../../src/dlq/routes");
		DlqRoutes = routes.DlqRoutes;
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	it("should create a router with all endpoints", () => {
		const router = DlqRoutes();
		expect(router).toBeDefined();

		const stack = router.stack || [];
		const paths = stack
			.filter(
				(layer: {
					route?: { path?: string; methods?: Record<string, boolean> };
				}) => layer.route
			)
			.map(
				(layer: {
					route: { path: string; methods: Record<string, boolean> };
				}) => ({
					path: layer.route.path,
					methods: Object.keys(layer.route.methods),
				})
			);

		expect(paths).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["post"]),
				}),
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/dlq",
					methods: expect.arrayContaining(["delete"]),
				}),
				expect.objectContaining({
					path: "/dlq/replay",
					methods: expect.arrayContaining(["post"]),
				}),
				expect.objectContaining({
					path: "/health",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/health/ready",
					methods: expect.arrayContaining(["get"]),
				}),
				expect.objectContaining({
					path: "/metrics",
					methods: expect.arrayContaining(["get"]),
				}),
			])
		);
	});
});
