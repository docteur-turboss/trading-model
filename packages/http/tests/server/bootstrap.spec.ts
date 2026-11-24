jest.mock("../../src/signal-handler", () => ({
	setupProcessHandlers: jest.fn(),
}));

jest.mock("../../src/bootstrap-shutdown", () => ({
	...jest.requireActual("../../src/bootstrap-shutdown"),
	hardShutdown: jest.fn(),
}));

import {
	NoopLogger,
	setLogger,
} from "@trading-model/contracts/logger-registry";
import { createBootstrap } from "../../src/bootstrap";
import { hardShutdown } from "../../src/bootstrap-shutdown";
import { setupProcessHandlers } from "../../src/signal-handler";

function createMockServer() {
	return {
		close: jest.fn().mockResolvedValue(undefined),
	};
}

describe("createBootstrap", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setLogger(NoopLogger);
		jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
	});

	it("should call setupProcessHandlers", () => {
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
		};

		createBootstrap(options);

		expect(setupProcessHandlers).toHaveBeenCalledTimes(1);
		expect(setupProcessHandlers).toHaveBeenCalledWith(
			expect.any(Function),
			expect.any(Function)
		);
	});

	it("should return a shutdown function", () => {
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
		};

		const result = createBootstrap(options);

		expect(result).toHaveProperty("shutdown");
		expect(typeof result.shutdown).toBe("function");
	});

	it("should call onStart callback when createServer completes", async () => {
		const onStart = jest.fn();
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
			onStart,
		};

		createBootstrap(options);
		await new Promise((r) => setImmediate(r));

		expect(onStart).toHaveBeenCalledTimes(1);
	});

	it("awaits an async onStart before logging success", async () => {
		const logger = {
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		};
		setLogger(logger as never);
		let release!: () => void;
		const onStart = () =>
			new Promise<void>((r) => {
				release = r;
			});
		createBootstrap({
			name: "svc",
			createServer: () => createMockServer(),
			onStart,
		});
		await new Promise((r) => setImmediate(r));
		expect(logger.info).not.toHaveBeenCalledWith(
			"Service started successfully",
			expect.anything()
		);
		release();
		await new Promise((r) => setImmediate(r));
		expect(logger.info).toHaveBeenCalledWith(
			"Service started successfully",
			expect.anything()
		);
	});

	it("routes a rejected onStart to the bootstrap error path", async () => {
		const logger = {
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		};
		setLogger(logger as never);
		createBootstrap({
			name: "svc",
			createServer: () => createMockServer(),
			onStart: async () => {
				throw new Error("boom");
			},
		});
		await new Promise((r) => setImmediate(r));
		expect(logger.error).toHaveBeenCalledWith(
			"Fatal error during service bootstrap",
			expect.anything()
		);
		expect(hardShutdown).toHaveBeenCalledWith(
			1,
			expect.anything(),
			expect.anything()
		);
	});

	it("should call onStop via shutdown function", async () => {
		const onStop = jest.fn();
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
			onStop,
		};

		const { shutdown } = createBootstrap(options);

		await shutdown("SIGTERM");

		expect(onStop).toHaveBeenCalled();
	});
});

describe("createBootstrap logging via the registry", () => {
	it("is silent without a registered logger, then logs through the HTTP logger once registered", () => {
		process.env.LOG_LEVEL = "info";
		jest.isolateModules(() => {
			const {
				setLogger,
				NoopLogger,
			} = require("@trading-model/contracts/logger-registry");
			const { createBootstrap: bootstrap } = require("../../src/bootstrap");
			const info = jest.spyOn(console, "info").mockImplementation(() => {});
			const opts = { name: "svc", createServer: () => createMockServer() };
			setLogger(NoopLogger);
			bootstrap(opts);
			expect(info).not.toHaveBeenCalled();
			// importing the HTTP logger registers it (setLogger at import time)
			require("../../src/logger");
			bootstrap(opts);
			expect(info).toHaveBeenCalledWith(
				expect.stringContaining("Bootstrapping service")
			);
			info.mockRestore();
		});
	});
});
