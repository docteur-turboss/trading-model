import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MONGO_URI: "mongodb://localhost:27017",
		MONGO_DB: "test",
		MONGO_COLLECTION: "dlq",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		INSTANCE_ID: "test",
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

jest.mock("../../src/config/db", () => ({
	getCollection: jest.fn(),
	isDbConnected: jest.fn(() => true),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { push: jest.fn() },
}));

describe("entry-validation barrel", () => {
	it("should re-export handleAddEntryError", () => {
		const mod = jest.requireActual(
			"../../src/shared/entry-validation"
		) as Record<string, unknown>;
		expect(typeof mod.handleAddEntryError).toBe("function");
	});

	it("should re-export pushToRedisQueue", () => {
		const mod = jest.requireActual(
			"../../src/shared/entry-validation"
		) as Record<string, unknown>;
		expect(typeof mod.pushToRedisQueue).toBe("function");
	});

	it("should re-export DeleteSchema and DlqEntrySchema", () => {
		const mod = jest.requireActual(
			"../../src/shared/entry-validation"
		) as Record<string, unknown>;
		expect(mod.DeleteSchema).toBeDefined();
		expect(mod.DlqEntrySchema).toBeDefined();
	});

	it("should re-export validateAddEntryBody", () => {
		const mod = jest.requireActual(
			"../../src/shared/entry-validation"
		) as Record<string, unknown>;
		expect(typeof mod.validateAddEntryBody).toBe("function");
	});
});
