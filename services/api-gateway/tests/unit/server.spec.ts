import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: jest
			.fn()
			.mockImplementation(
				(opts: { env: unknown; routes: (app: any) => void }) => {
					opts.routes({ use: jest.fn() });
					return Promise.resolve({ close: jest.fn(), raw: {} });
				}
			),
	})
);

jest.mock("../../src/infrastructure/config/env", () => ({
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

jest.mock("../../src/adapters/inbound/router", () => ({
	createRouter: jest.fn(() => ({ stack: [] })),
}));

import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { createServer } from "../../src/application/server";

describe("server", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should call createServiceServer with env config", () => {
		void createServer();

		expect(createServiceServer).toHaveBeenCalledWith(
			expect.objectContaining({
				env: expect.objectContaining({
					PORT: 3000,
				}),
			})
		);
	});
});
