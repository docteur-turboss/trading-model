jest.mock("../src/infrastructure/signal-handler", () => ({
	setupProcessHandlers: jest.fn(),
}));

import { createBootstrap } from "../src/application/services/bootstrap";
import { setupProcessHandlers } from "../src/infrastructure/signal-handler";

function createMockServer() {
	return {
		close: jest.fn().mockResolvedValue(undefined),
	};
}

describe("createBootstrap", () => {
	beforeEach(() => {
		jest.clearAllMocks();
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

	it("should call onStart callback when createServer completes", () => {
		const onStart = jest.fn();
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
			onStart,
		};

		createBootstrap(options);

		expect(onStart).toHaveBeenCalledTimes(1);
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
			const {
				createBootstrap: bootstrap,
			} = require("../src/application/services/bootstrap");
			const info = jest.spyOn(console, "info").mockImplementation(() => {});
			const opts = { name: "svc", createServer: () => createMockServer() };
			setLogger(NoopLogger);
			bootstrap(opts);
			expect(info).not.toHaveBeenCalled();
			// importing the HTTP logger registers it (setLogger at import time)
			require("@trading-model/http/infrastructure/logger");
			bootstrap(opts);
			expect(info).toHaveBeenCalledWith(
				expect.stringContaining("Bootstrapping service")
			);
			info.mockRestore();
		});
	});
});
