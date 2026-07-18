import { describe, expect, it, jest } from "@jest/globals";

const MOCK_FIND_A_SERVICE = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		MESSAGE_MANAGER_URL: "",
		MONGO_URI: "mongodb://localhost:27017",
		MONGO_DB: "test",
		MONGO_COLLECTION: "dlq",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
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

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: MOCK_FIND_A_SERVICE,
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("address-resolver", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return null when MESSAGE_MANAGER_URL is empty and no service found", async () => {
		MOCK_FIND_A_SERVICE.mockResolvedValue(null);

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/address-resolver"
		) as { resolveMessageManagerUrl: () => Promise<string | null> };
		const result = await resolveMessageManagerUrl();

		expect(result).toBeNull();
		expect(MOCK_FIND_A_SERVICE).toHaveBeenCalledWith("message-manager");
	});

	it("should resolve from service discovery", async () => {
		MOCK_FIND_A_SERVICE.mockResolvedValue({ host: "10.0.0.1", port: 3000 });

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/address-resolver"
		) as { resolveMessageManagerUrl: () => Promise<string | null> };
		const result = await resolveMessageManagerUrl();

		expect(result).toBe("https://10.0.0.1:3000");
	});

	it("should handle service discovery failure", async () => {
		MOCK_FIND_A_SERVICE.mockRejectedValue(new Error("Discovery failed"));

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/address-resolver"
		) as { resolveMessageManagerUrl: () => Promise<string | null> };
		const result = await resolveMessageManagerUrl();

		expect(result).toBeNull();
	});
});
