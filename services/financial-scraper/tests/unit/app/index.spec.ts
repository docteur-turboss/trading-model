import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<any>();

jest.mock("@trading-model/common/server/bootstrap", () => ({
	createBootstrap: MOCK_CREATE_BOOTSTRAP,
}));

jest.mock("../../../src/app/server", () => ({
	createServer: jest.fn(() => ({ close: jest.fn() })),
}));

jest.mock("config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 3000,
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
		LOG_LEVEL: "debug",
		APP_NAME: "financial-scraper",
		APP_VERSION: "1.0.0",
		SERVICE_NAME: "financial-scraper-service",
		INSTANCE_ID: "instance-1",
		CACHE_TTL_MS: "30000",
		SERVICE_PING_TIMEOUT_MS: "2000",
		TOKEN_REFRESH_INTERVAL_MS: "60000",
		TTL_REFRESH_INTERVAL_MS: "15000",
		ADDRESS_MANAGER_URL: "https://address-manager.example.com",
		ERROR_URL_WEBHOOK: "https://webhook.example.com/error",
		MESSAGE_BUS_INIT_TIMEOUT_MS: "2000",
		MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: "2000",
		MESSAGE_CALLBACK_PATH: "message",
	},
}));

jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn(() => ({
		stop: jest.fn(),
	})),
}));

import "../../../src/app/index";

describe("app/index", () => {
	it("should call createBootstrap on load", () => {
		expect(MOCK_CREATE_BOOTSTRAP).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Financial Scraper" })
		);
	});

	it("should pass createServer function", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		expect(typeof opts.createServer).toBe("function");
	});

	it("onStop should handle null addressManager", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		expect(() => opts.onStop()).not.toThrow();
	});

	it("onStart should bootstrap address manager", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		expect(() => opts.onStart()).not.toThrow();
	});

	it("onStop should stop address manager after start", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		opts.onStart();
		expect(() => opts.onStop()).not.toThrow();
	});
});
