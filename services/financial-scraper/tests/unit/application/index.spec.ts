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
		SERVICE_NAME: "financial-scraper",
		INSTANCE_ID: "instance-1",
		MESSAGE_CALLBACK_PATH: "message",
		SYMBOLS_TO_TRACK: [],
		SCRAPE_INTERVAL: "*/1 * * * *",
		SCRAPE_SCHEDULER_ENABLED: true,
	},
}));

const MOCK_CLOSE_DATABASE = jest.fn(async (..._args: any[]) => undefined);
jest.mock("../../../src/config/db", () => ({
	closeDatabase: MOCK_CLOSE_DATABASE,
}));

import "../../../src/application/index";

describe("app/index", () => {
	// Idle pool connections kept the process alive until SIGKILL.
	it("onStop should close the MySQL pool so the process can exit", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];

		await opts.onStop();

		expect(MOCK_CLOSE_DATABASE).toHaveBeenCalled();
	});
});
