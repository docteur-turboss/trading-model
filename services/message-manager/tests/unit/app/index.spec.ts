import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/http/bootstrap", () => ({
	createBootstrap: MOCK_CREATE_BOOTSTRAP,
}));

jest.mock("../../../src/application/server", () => ({
	createServer: jest.fn((..._args: any[]) => ({
		close: jest.fn<(...args: any[]) => any>(),
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

jest.mock("@trading-model/http/telemetry", () => ({
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

	it("onStop should close the subscription store connection", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		await opts.onStop();
		expect(MOCK_CLOSE_MESSAGE_MANAGER).toHaveBeenCalled();
	});

	it("should let in-flight publishes finish before closing", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		expect(opts.shutdown.closeTimeoutMs).toBe(PUBLISH_ACCEPT_TIMEOUT_MS);
	});
});
