import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_BOOTSTRAP = jest.fn<(...args: any[]) => any>();

const MOCK_WARN = jest.fn<(...args: any[]) => any>();
const MOCK_CONNECT_DB = jest.fn<() => Promise<void>>();
const MOCK_CLOSE_DB = jest.fn(async () => undefined);

jest.mock("@trading-model/http/logger", () => ({
	logger: { info: jest.fn(), error: jest.fn(), warn: MOCK_WARN },
}));
jest.mock("@trading-model/http/bootstrap", () => ({
	createBootstrap: MOCK_CREATE_BOOTSTRAP,
}));
jest.mock("@trading-model/http/telemetry", () => ({
	shutdownTelemetry: jest.fn(async () => undefined),
}));
jest.mock("../../src/application/telemetry", () => ({}));
jest.mock("../../src/application/server", () => ({ createServer: jest.fn() }));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { PORT: 3000, MONGO_DB: "dlq" },
}));
jest.mock("../../src/config/container", () => ({
	createDlqApp: () => ({
		handlers: {},
		connectDb: MOCK_CONNECT_DB,
		releaseStaleClaims: jest.fn(async () => undefined),
		start: jest.fn(),
		shutdownSchedulers: jest.fn(async () => undefined),
		closeDb: MOCK_CLOSE_DB,
	}),
}));

import "../../src/application/index";

describe("application/index", () => {
	it("onBeforeServer returns without waiting for MongoDB", () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		MOCK_CONNECT_DB.mockReturnValueOnce(new Promise(() => undefined));
		expect(opts.onBeforeServer()).toBeUndefined();
		expect(MOCK_CONNECT_DB).toHaveBeenCalledTimes(1);
	});

	it("onStop closes the db", async () => {
		const opts: any = MOCK_CREATE_BOOTSTRAP.mock.calls[0][0];
		await opts.onStop();
		expect(MOCK_CLOSE_DB).toHaveBeenCalledTimes(1);
	});
});
