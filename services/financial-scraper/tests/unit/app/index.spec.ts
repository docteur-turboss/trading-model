import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/server-utils/application/services/bootstrap", () => ({
	createBootstrap: MOCK_CREATE_BOOTSTRAP,
}));

jest.mock("../../../src/application/server", () => ({
	createServer: jest.fn((..._args: any[]) => ({
		close: jest.fn<(...args: any[]) => any>(),
	})),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
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
		SYMBOLS_TO_TRACK: [],
		SCRAPE_INTERVAL: "*/1 * * * *",
		SCRAPE_SCHEDULER_ENABLED: true,
	},
}));

jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn((..._args: any[]) => ({
		stop: jest.fn<(...args: any[]) => any>(),
	})),
}));

const MOCK_CLOSE_DATABASE = jest.fn(async (..._args: any[]) => undefined);
jest.mock("../../../src/config/db", () => ({
	closeDatabase: MOCK_CLOSE_DATABASE,
}));

import "../../../src/application/index";

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

	// Idle pool connections kept the process alive until SIGKILL.
	it("onStop should close the MySQL pool so the process can exit", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];

		await opts.onStop();

		expect(MOCK_CLOSE_DATABASE).toHaveBeenCalled();
	});
});
