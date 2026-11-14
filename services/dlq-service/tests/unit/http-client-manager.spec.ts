import { describe, expect, it, jest } from "@jest/globals";

const MOCK_HTTP_CLIENT_INSTANCE = {};

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

	it("should close HTTP client", async () => {
		const { closeHttpClient } = jest.requireActual(
			"../../src/adapters/outbound/http-client-manager"
		) as { closeHttpClient: () => void };
		closeHttpClient();
	});
});
