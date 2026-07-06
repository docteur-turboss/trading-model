import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_TLS_CONFIG = {
	key: "/certs/key.pem",
	cert: "/certs/cert.pem",
	ca: "/certs/ca.pem",
};

jest.mock("@trading-model/common/server/create-secure-server", () => ({
	createSecureServer: jest
		.fn()
		.mockImplementation(
			(opts: { port: number; tls: unknown; routes: (app: any) => void }) => {
				opts.routes({ use: jest.fn() });
				return Promise.resolve({ close: jest.fn(), raw: {} });
			}
		),
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		PORT: 3000,
		TLS_KEY_PATH: "/certs/key.pem",
		TLS_CERT_PATH: "/certs/cert.pem",
		TLS_CA_PATH: "/certs/ca.pem",
		DISCOVERY_SERVICE_URL: "https://discovery:3000",
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "",
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 100,
		CACHE_TTL_MS: 5000,
		PROXY_TIMEOUT_MS: 5000,
	},
}));

jest.mock("../../src/core/router", () => ({
	createRouter: jest.fn(() => ({ stack: [] })),
}));

import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { createServer } from "../../src/app/server";

describe("server", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should call createSecureServer with port and tls config", () => {
		void createServer();

		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 3000,
				tls: MOCK_TLS_CONFIG,
			})
		);
	});
});
