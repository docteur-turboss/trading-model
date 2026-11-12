import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<(...args: any[]) => any>();
const MOCK_DISCOVERY_STOP = jest.fn<(...args: any[]) => any>();

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
		closeDb: jest.fn(async () => undefined),
	}),
}));

import "../../src/application/index";

describe("application/index", () => {
	it("onStop stops the discovery lifecycle started by onStart", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		opts.onStart();
		await opts.onStop();
		expect(MOCK_DISCOVERY_STOP).toHaveBeenCalledTimes(1);
	});
});
