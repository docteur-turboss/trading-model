import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/env", () => ({
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

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

describe("shared/index barrel", () => {
	it("should re-export ActiveReplayCounter and activeReplays", () => {
		const mod = jest.requireActual("../../src/dlq/shared/index") as Record<
			string,
			unknown
		>;
		expect(mod.ActiveReplayCounter).toBeDefined();
		expect(mod.activeReplays).toBeDefined();
	});

	it("should re-export closeHttpClient, getHttpClient, reloadHttpClientTls", () => {
		const mod = jest.requireActual("../../src/dlq/shared/index") as Record<
			string,
			unknown
		>;
		expect(typeof mod.closeHttpClient).toBe("function");
		expect(typeof mod.getHttpClient).toBe("function");
		expect(typeof mod.reloadHttpClientTls).toBe("function");
	});

	it("should re-export resolveMessageManagerUrl", () => {
		const mod = jest.requireActual("../../src/dlq/shared/index") as Record<
			string,
			unknown
		>;
		expect(typeof mod.resolveMessageManagerUrl).toBe("function");
	});

	it("should re-export isShuttingDown and setShuttingDown", () => {
		const mod = jest.requireActual("../../src/dlq/shared/index") as Record<
			string,
			unknown
		>;
		expect(typeof mod.isShuttingDown).toBe("function");
		expect(typeof mod.setShuttingDown).toBe("function");
	});
});
