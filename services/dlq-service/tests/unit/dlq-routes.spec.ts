import { describe, expect, it, jest } from "@jest/globals";

jest.mock("express-rate-limit", () => {
	return () => {
		const fn: Record<string, unknown> = (() => {}) as unknown as Record<
			string,
			unknown
		>;
		fn.resetKey = jest.fn<(...args: any[]) => any>();
		return fn;
	};
});

jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("@trading-model/http/adapters/inbound/catch-error", () => ({
	catchSync: (fn: (...args: never[]) => unknown) => fn,
}));

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => ({
	sendResponse: (data: unknown) => data,
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

jest.mock("../../src/config/db", () => ({
	isDbConnected: () => true,
	getCollection: jest.fn<(...args: any[]) => any>(),
	getMissingCriticalIndexes: () => [],
}));

jest.mock("../../src/adapters/outbound/repository", () => ({
	dlqRepository: {
		insert: jest.fn<(...args: any[]) => any>(),
		query: jest.fn<(...args: any[]) => any>(),
		delete: jest.fn<(...args: any[]) => any>(),
		count: jest.fn<(...args: any[]) => any>(),
		prune: jest.fn<(...args: any[]) => any>(),
		listQueuable: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/adapters/outbound/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: jest.fn<(...args: any[]) => any>(),
		releaseStaleClaims: jest.fn<(...args: any[]) => any>(),
		releaseClaimWithoutCount: jest.fn<(...args: any[]) => any>(),
		incrementRetryCount: jest.fn<(...args: any[]) => any>(),
		releaseClaimsByInstance: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/adapters/outbound/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: jest.fn<(...args: any[]) => any>(),
		abandonExhaustedEntries: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
	AddressManager: { start: jest.fn<(...args: any[]) => any>() },
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
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
	metricsHandler: jest.fn<(...args: any[]) => any>(),
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

jest.mock("@trading-model/validation/application/services/validate-env", () => {
	const actual = jest.requireActual<Record<string, unknown>>(
		"@trading-model/validation/application/services/validate-env"
	);
	return {
		...actual,
		validateEnv: (schema: unknown) => {
			const result = (
				schema as { parse: (...args: unknown[]) => unknown }
			).parse({
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
			});
			return result;
		},
	};
});

describe("DLQ Routes", () => {
	let DlqRoutes: () => ReturnType<typeof import("express").Router>;

	beforeAll(() => {
		const routes = jest.requireActual<
			typeof import("../../src/adapters/inbound/routes")
		>("../../src/adapters/inbound/routes");
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
			.map((layer) => {
				const route = layer.route as unknown as {
					path: string;
					methods: Record<string, boolean>;
				};
				return { path: route.path, methods: Object.keys(route.methods) };
			});

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
