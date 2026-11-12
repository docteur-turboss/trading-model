import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<(...args: any[]) => any>();
const MOCK_DISCOVERY_STOP = jest.fn<(...args: any[]) => any>();

const MOCK_WARN = jest.fn<(...args: any[]) => any>();
const MOCK_CLOSE_DB = jest.fn(async () => undefined);

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: { info: jest.fn(), error: jest.fn(), warn: MOCK_WARN },
}));
jest.mock("@trading-model/server-utils/application/services/bootstrap", () => ({
	createBootstrap: MOCK_CREATE_BOOTSTRAP,
}));
jest.mock("@trading-model/server-utils/infrastructure/telemetry", () => ({
	shutdownTelemetry: jest.fn(async () => undefined),
}));
jest.mock("../../src/application/telemetry", () => ({}));
jest.mock("../../src/application/server", () => ({ createServer: jest.fn() }));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { PORT: 3000, MONGO_DB: "dlq" },
}));
jest.mock("../../src/config/address-manager", () => ({
	AddressManager: {
		lifecycleManager: { start: () => ({ stop: MOCK_DISCOVERY_STOP }) },
	},
}));
jest.mock("../../src/config/container", () => ({
	createDlqApp: () => ({
		handlers: {},
		start: jest.fn(),
		shutdownSchedulers: jest.fn(async () => undefined),
		closeDb: MOCK_CLOSE_DB,
	}),
}));

import "../../src/application/index";

describe("application/index", () => {
	it("onStop awaits the discovery stop started by onStart", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		let done = false;
		MOCK_DISCOVERY_STOP.mockImplementationOnce(async () => {
			await new Promise((r) => setTimeout(r, 5));
			done = true;
		});
		opts.onStart();
		await opts.onStop();
		expect(MOCK_DISCOVERY_STOP).toHaveBeenCalledTimes(1);
		expect(done).toBe(true);
	});

	it("onStop logs a rejected discovery stop and still closes the db", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		MOCK_DISCOVERY_STOP.mockRejectedValueOnce(new Error("boom"));
		opts.onStart();
		await opts.onStop();
		expect(MOCK_WARN).toHaveBeenCalledWith(
			"Error stopping address manager",
			expect.anything()
		);
		expect(MOCK_CLOSE_DB).toHaveBeenCalledTimes(2);
	});
});
