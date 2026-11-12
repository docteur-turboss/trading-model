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

const CALLS: string[] = [];
const MOCK_LEAVE = jest.fn(async (..._args: any[]) => {
	CALLS.push("leave");
});

jest.mock("../../../src/config/address-manager", () => ({
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn((..._args: any[]) => ({
		stop: jest.fn<(...args: any[]) => any>(),
		leave: MOCK_LEAVE,
	})),
}));

const MOCK_CLOSE_MESSAGE_MANAGER = jest.fn(
	async (..._args: any[]) => undefined
);
const MOCK_START_DELIVERY = jest.fn<(...args: any[]) => any>();

jest.mock("../../../src/config/message-manager", () => ({
	closeMessageManager: MOCK_CLOSE_MESSAGE_MANAGER,
	startDelivery: MOCK_START_DELIVERY,
}));

jest.mock("@trading-model/server-utils/infrastructure/telemetry", () => ({
	startTelemetry: jest.fn<(...args: any[]) => any>(),
	shutdownTelemetry: jest.fn(async (..._args: any[]) => undefined),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 3000,
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
		LOG_LEVEL: "debug",
		APP_NAME: "message-manager",
		APP_VERSION: "1.0.0",
		SERVICE_NAME: "message-manager-service",
		INSTANCE_ID: "instance-1",
		CACHE_TTL_MS: 30000,
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

import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import "../../../src/application/index";

describe("app/index", () => {
	it("should call createBootstrap on load", () => {
		expect(MOCK_CREATE_BOOTSTRAP).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Message Manager" })
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

	it("onStop should close the subscription store connection", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		await opts.onStop();
		expect(MOCK_CLOSE_MESSAGE_MANAGER).toHaveBeenCalled();
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

	it("should let in-flight publishes finish before closing", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		expect(opts.shutdown.closeTimeoutMs).toBe(PUBLISH_ACCEPT_TIMEOUT_MS);
	});

	// Publishers keep the address they resolved for CACHE_TTL_MS: until then
	// this instance must keep serving.
	it("should leave discovery, then serve CACHE_TTL_MS more before closing", async () => {
		jest.useFakeTimers();
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		opts.onStart();
		let done = false;
		const closing = opts.shutdown.beforeClose().then(() => {
			done = true;
		});
		await Promise.resolve();
		expect(CALLS).toContain("leave");
		await jest.advanceTimersByTimeAsync(29_999);
		expect(done).toBe(false);
		await jest.advanceTimersByTimeAsync(1);
		await closing;
		expect(done).toBe(true);
		jest.useRealTimers();
	});
});
