import { describe, expect, it, jest } from "@jest/globals";

const MOCK_FIND_A_SERVICE = jest.fn();
const envMock = { ENV: { MESSAGE_MANAGER_URL: "https://mm:3000" } };

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: MOCK_FIND_A_SERVICE,
}));

jest.mock("../../src/infrastructure/config/env", () => envMock);

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("message-manager-resolver", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		envMock.ENV.MESSAGE_MANAGER_URL = "https://mm:3000";
	});

	it("should return URL from ENV when MESSAGE_MANAGER_URL is set", async () => {
		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/shared/message-manager-resolver"
		) as { resolveMessageManagerUrl: () => Promise<unknown> };

		const result = await resolveMessageManagerUrl();

		expect(result).toBe("https://mm:3000");
		expect(MOCK_FIND_A_SERVICE).not.toHaveBeenCalled();
	});

	it("should fall back to address manager when ENV is not set", async () => {
		envMock.ENV.MESSAGE_MANAGER_URL = "";
		MOCK_FIND_A_SERVICE.mockResolvedValue({
			host: "10.0.0.5",
			port: 3000,
		});

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/shared/message-manager-resolver"
		) as { resolveMessageManagerUrl: () => Promise<unknown> };

		const result = await resolveMessageManagerUrl();

		expect(result).toBe("https://10.0.0.5:3000");
	});

	it("should return null when both ENV and address manager fail", async () => {
		envMock.ENV.MESSAGE_MANAGER_URL = "";
		MOCK_FIND_A_SERVICE.mockResolvedValue(null);

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/shared/message-manager-resolver"
		) as { resolveMessageManagerUrl: () => Promise<unknown> };

		const result = await resolveMessageManagerUrl();

		expect(result).toBeNull();
	});

	it("should handle address manager error gracefully", async () => {
		envMock.ENV.MESSAGE_MANAGER_URL = "";
		MOCK_FIND_A_SERVICE.mockRejectedValue(new Error("network error"));

		const { resolveMessageManagerUrl } = jest.requireActual(
			"../../src/dlq/shared/message-manager-resolver"
		) as { resolveMessageManagerUrl: () => Promise<unknown> };

		const result = await resolveMessageManagerUrl();

		expect(result).toBeNull();
	});
});
