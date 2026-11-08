import { describe, expect, it, jest } from "@jest/globals";

const MOCK_HTTP_CLIENT_INSTANCE = {
	reloadTlsPaths: jest.fn<(...args: any[]) => any>(),
};

let mockBuildTlsFromEnv: jest.Mock<(...args: any[]) => any>;

jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: jest.fn((..._args: any[]) => MOCK_HTTP_CLIENT_INSTANCE),
}));

jest.mock("@trading-model/common/config/tls-paths", () => {
	mockBuildTlsFromEnv = jest.fn((..._args: any[]) => ({}));
	return { buildTlsFromEnv: mockBuildTlsFromEnv };
});

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		TLS_CA_PATH: "/tmp/ca.pem",
		TLS_CERT_PATH: "/tmp/cert.pem",
		TLS_KEY_PATH: "/tmp/key.pem",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

describe("http-client-manager", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it("should create HttpClient on first get", async () => {
		const { getHttpClient } = jest.requireActual(
			"../../src/adapters/outbound/http-client-manager"
		) as { getHttpClient: () => Promise<unknown> };
		const client = await getHttpClient();
		expect(client).toBe(MOCK_HTTP_CLIENT_INSTANCE);
	});

	it("should return cached client on subsequent get", async () => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/http-client-manager"
		) as {
			getHttpClient: () => Promise<unknown>;
		};
		const first = await mod.getHttpClient();
		const second = await mod.getHttpClient();
		expect(first).toBe(second);
	});

	it("should reload TLS certificates", async () => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/http-client-manager"
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
			"../../src/adapters/outbound/http-client-manager"
		) as {
			getHttpClient: () => Promise<unknown>;
			reloadHttpClientTls: () => Promise<void>;
		};
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock<(...args: any[]) => any> };
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
			"../../src/adapters/outbound/http-client-manager"
		) as { closeHttpClient: () => void };
		closeHttpClient();
	});

	it("should not reload TLS when no client exists", async () => {
		const { reloadHttpClientTls } = jest.requireActual(
			"../../src/adapters/outbound/http-client-manager"
		) as { reloadHttpClientTls: () => Promise<void> };
		await reloadHttpClientTls();
		expect(MOCK_HTTP_CLIENT_INSTANCE.reloadTlsPaths).not.toHaveBeenCalled();
	});
});
