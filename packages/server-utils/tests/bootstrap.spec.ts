jest.mock("../src/server/signal-handler", () => ({
	setupProcessHandlers: jest.fn(),
}));

import type http from "node:http";
import { createBootstrap } from "../src/server/bootstrap";
import { setupProcessHandlers } from "../src/server/signal-handler";

function createMockServer() {
	return {
		close: jest.fn().mockResolvedValue(undefined),
		raw: {} as http.Server,
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

	it("should call tlsBootstrap.ensure when provided", () => {
		const ensure = jest.fn();
		const tlsBootstrap = { ensure };
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
			tlsBootstrap,
		};

		createBootstrap(options);

		expect(ensure).toHaveBeenCalledTimes(1);
	});

	it("should call tlsBootstrap.setupAutoRenew when provided", async () => {
		const ensure = jest.fn().mockResolvedValue(undefined);
		const setupAutoRenew = jest.fn();
		const tlsBootstrap = {
			ensure,
			setupAutoRenew,
		};
		const options = {
			name: "test-service",
			createServer: jest.fn().mockReturnValue(createMockServer()),
			tlsBootstrap,
		};

		createBootstrap(options);

		await new Promise(setImmediate);

		expect(setupAutoRenew).toHaveBeenCalledTimes(1);
	});
});
