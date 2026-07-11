import { describe, expect, it, jest } from "@jest/globals";

const MOCK_HTTP_CLIENT_INSTANCE = {
	reloadTlsPaths: jest.fn(),
};

let mockBuildTlsFromEnv: jest.Mock;

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: jest.fn(() => MOCK_HTTP_CLIENT_INSTANCE),
}));

jest.mock("@trading-model/common/domain/tls-paths", () => {
	mockBuildTlsFromEnv = jest.fn(() => ({}));
	return { buildTlsFromEnv: mockBuildTlsFromEnv };
});

jest.mock("../../src/config/env", () => ({
	ENV: {
		TLS_CA_PATH: "/tmp/ca.pem",
		TLS_CERT_PATH: "/tmp/cert.pem",
		TLS_KEY_PATH: "/tmp/key.pem",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("http-client-manager", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it("should create HttpClient on first get", async () => {
		const { getHttpClient } = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as { getHttpClient: () => Promise<unknown> };
		const client = await getHttpClient();
		expect(client).toBe(MOCK_HTTP_CLIENT_INSTANCE);
	});

	it("should return cached client on subsequent get", async () => {
		const mod = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as {
			getHttpClient: () => Promise<unknown>;
		};
		const first = await mod.getHttpClient();
		const second = await mod.getHttpClient();
		expect(first).toBe(second);
	});

	it("should reload TLS certificates", async () => {
		const mod = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as {
			getHttpClient: () => Promise<unknown>;
			reloadHttpClientTls: () => Promise<void>;
		};
		MOCK_HTTP_CLIENT_INSTANCE.reloadTlsPaths.mockResolvedValue(
			undefined as never
		);

		await mod.getHttpClient();
		await mod.reloadHttpClientTls();

		expect(MOCK_HTTP_CLIENT_INSTANCE.reloadTlsPaths).toHaveBeenCalled();
	});

	it("should handle reload TLS error gracefully", async () => {
		const mod = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as {
			getHttpClient: () => Promise<unknown>;
			reloadHttpClientTls: () => Promise<void>;
		};
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock };
		};

		await mod.getHttpClient();
		MOCK_HTTP_CLIENT_INSTANCE.reloadTlsPaths.mockRejectedValue(
			new Error("tls error")
		);

		await mod.reloadHttpClientTls();

		expect(logger.logger.error).toHaveBeenCalledWith(
			"Failed to reload HTTP client TLS certificates",
			expect.any(Object)
		);
	});

	it("should close HTTP client", async () => {
		const { closeHttpClient } = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as { closeHttpClient: () => void };
		closeHttpClient();
	});

	it("should not reload TLS when no client exists", async () => {
		const { reloadHttpClientTls } = jest.requireActual(
			"../../src/dlq/shared/http-client-manager"
		) as { reloadHttpClientTls: () => Promise<void> };
		await reloadHttpClientTls();
		expect(MOCK_HTTP_CLIENT_INSTANCE.reloadTlsPaths).not.toHaveBeenCalled();
	});
});
