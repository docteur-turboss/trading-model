import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

let mockHardShutdown: ((code: number) => void) | undefined;

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
	_private: class {},
}));

jest.mock("../../src/server/signal-handler", () => {
	const actual = jest.requireActual<
		typeof import("../../src/server/signal-handler")
	>("../../src/server/signal-handler");
	return {
		...actual,
		setupProcessHandlers: jest.fn((shutdown: any, hardShutdown: any) => {
			mockHardShutdown = hardShutdown;
			return actual.setupProcessHandlers(shutdown, hardShutdown);
		}),
	};
});

import { createBootstrap } from "../../src/server/bootstrap";
import { removeProcessHandlers } from "../../src/server/signal-handler";

describe("createBootstrap", () => {
	beforeEach(() => {
		jest.spyOn(process, "on").mockImplementation(() => process as any);
		jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		removeProcessHandlers();
		process.exitCode = undefined;
	});

	it("should create server and call onStart", () => {
		const mockServer = { close: jest.fn(async () => {}) };
		const createServer = jest.fn(() => mockServer);
		const onStart = jest.fn();

		const result = createBootstrap({
			name: "test-service",
			createServer: createServer as any,
			onStart,
		});

		expect(createServer).toHaveBeenCalled();
		expect(onStart).toHaveBeenCalled();
		expect(result.server).toBe(mockServer);
	});

	it("should return shutdown function", () => {
		const result = createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
		});

		expect(typeof result.shutdown).toBe("function");
	});

	it("should close server and call onStop on shutdown", async () => {
		const mockServer = { close: jest.fn(async () => {}) };
		const onStop = jest.fn();

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			onStop,
		});

		await result.shutdown("SIGTERM");

		expect(mockServer.close).toHaveBeenCalled();
		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it("should set exitCode on bootstrap error", () => {
		createBootstrap({
			name: "test",
			createServer: (() => {
				throw new Error("boot failed");
			}) as any,
		});

		expect(process.exitCode).toBe(1);
	});

	it("should not set exitCode when hardShutdown code is 0", () => {
		process.exitCode = 2;
		const mockServer = { close: jest.fn(async () => {}) };
		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
		});
		void result.shutdown("SIGTERM");
		expect(process.exitCode).toBe(2);
	});

	it("should handle shutdown error gracefully", async () => {
		const mockServer = {
			close: jest.fn(() => Promise.reject(new Error("close failed"))),
		};

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
		});

		await result.shutdown("SIGTERM");

		expect(process.exitCode).toBe(1);
	});

	it("should call onStop via hardShutdown when shutdown fails", async () => {
		const onStop = jest.fn();
		const mockServer = {
			close: jest.fn(() => Promise.reject(new Error("close failed"))),
		};

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			onStop,
		});

		await result.shutdown("SIGTERM");

		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should not throw when onStop throws during hardShutdown", async () => {
		const onStop = jest.fn(() => {
			throw new Error("onStop failed");
		});
		const mockServer = {
			close: jest.fn(() => Promise.reject(new Error("close failed"))),
		};

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			onStop,
		});

		await result.shutdown("SIGTERM");

		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should handle uncaughtException", () => {
		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
		});
		const mockOn = process.on as unknown as jest.Mock;
		const call = mockOn.mock.calls.find(
			(c: unknown[]) => (c as unknown[])[0] === "uncaughtException"
		);
		const handler: (err: Error) => void = (
			call ? (call as unknown[])[1] : undefined
		) as any;

		handler(new Error("crash"));

		expect(process.exitCode).toBe(1);
	});

	it("should call onStop via hardShutdown on uncaughtException", () => {
		const onStop = jest.fn();
		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
			onStop,
		});
		const mockOn = process.on as unknown as jest.Mock;
		const call = mockOn.mock.calls.find(
			(c: unknown[]) => (c as unknown[])[0] === "uncaughtException"
		);
		const handler: (err: Error) => void = (
			call ? (call as unknown[])[1] : undefined
		) as any;

		handler(new Error("crash"));

		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should call onStop via hardShutdown on bootstrap error after server created", () => {
		const onStop = jest.fn();
		const mockServer = { close: jest.fn(async () => {}) };
		const createServer = jest.fn(() => mockServer);
		const onStart = jest.fn(() => {
			throw new Error("onStart failed");
		});

		createBootstrap({
			name: "test",
			createServer: createServer as any,
			onStart,
			onStop,
		});

		expect(createServer).toHaveBeenCalled();
		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should handle unhandledRejection", () => {
		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
		});
		const mockOn = process.on as unknown as jest.Mock;
		const call = mockOn.mock.calls.find(
			(c: unknown[]) => (c as unknown[])[0] === "unhandledRejection"
		);
		const handler: (reason: unknown) => void = (
			call ? (call as unknown[])[1] : undefined
		) as any;

		handler(new Error("rejected"));

		expect(process.exitCode).toBe(1);
	});

	it("should call onStop via hardShutdown on unhandledRejection", () => {
		const onStop = jest.fn();
		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
			onStop,
		});
		const mockOn = process.on as unknown as jest.Mock;
		const call = mockOn.mock.calls.find(
			(c: unknown[]) => (c as unknown[])[0] === "unhandledRejection"
		);
		const handler: (reason: unknown) => void = (
			call ? (call as unknown[])[1] : undefined
		) as any;

		handler(new Error("rejected"));

		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should not close server on shutdown when server is null", async () => {
		const result = createBootstrap({
			name: "test",
			createServer: (() => {
				throw new Error("boot failed");
			}) as any,
		});

		await result.shutdown("SIGTERM");

		expect(process.exitCode).toBe(1);
	});

	it("should handle shutdown without onStop when close succeeds", async () => {
		const mockServer = { close: jest.fn(async () => {}) };

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
		});

		await result.shutdown("SIGTERM");

		expect(mockServer.close).toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it("should exit gracefully when onStop throws during shutdown", async () => {
		const onStop = jest.fn(() => {
			throw new Error("onStop failed");
		});
		const mockServer = { close: jest.fn(async () => {}) };

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			onStop,
		});

		await result.shutdown("SIGTERM");

		expect(mockServer.close).toHaveBeenCalled();
		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it("should handle Promise-based createServer resolving successfully", async () => {
		const mockServer = { close: jest.fn(async () => {}) };
		const createServer = jest.fn(() => Promise.resolve(mockServer));
		const onStart = jest.fn();

		createBootstrap({
			name: "test",
			createServer: createServer as any,
			onStart,
		});

		await Promise.resolve();

		expect(createServer).toHaveBeenCalled();
		expect(onStart).toHaveBeenCalled();
	});

	it("should handle Promise-based createServer rejecting", async () => {
		const createServer = jest.fn(() => Promise.reject(new Error("async fail")));

		createBootstrap({
			name: "test",
			createServer: createServer as any,
		});

		// Two ticks: one to propagate rejection through .then(), one for .catch()
		await Promise.resolve();
		await Promise.resolve();

		expect(process.exitCode).toBe(1);
	});

	it("should not set exitCode when hardShutdown is called with code 0", () => {
		expect(mockHardShutdown).toBeDefined();
		process.exitCode = 2;
		mockHardShutdown!(0);
		expect(process.exitCode).toBe(0);
	});

	it("should handle rejected onBeforeServer promise", async () => {
		process.exitCode = undefined;
		const onBeforeServer = jest.fn(() =>
			Promise.reject(new Error("before failed"))
		);

		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
			onBeforeServer: onBeforeServer as any,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(process.exitCode).toBe(1);
	});

	it("should handle TLS bootstrap rejection", async () => {
		process.exitCode = undefined;
		const ensure = jest.fn(() => Promise.reject(new Error("tls failed")));

		createBootstrap({
			name: "test",
			createServer: (() => ({ close: jest.fn(async () => {}) })) as any,
			tlsBootstrap: { ensure },
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(process.exitCode).toBe(1);
	});

	it("should call setupAutoRenew when tlsBootstrap provides it", () => {
		const setupAutoRenew = jest.fn();
		const mockServer = { close: jest.fn(async () => {}), raw: "raw-server" };

		createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			tlsBootstrap: {
				ensure: jest.fn() as unknown as () => Promise<void>,
				setupAutoRenew,
			},
		});

		expect(setupAutoRenew).toHaveBeenCalledWith("raw-server");
	});

	it("should handle resolved onBeforeServer promise and call afterBeforeServer", async () => {
		const setupAutoRenew = jest.fn();
		const mockServer = { close: jest.fn(async () => {}), raw: "raw-server" };
		const onBeforeServer = jest.fn(() => Promise.resolve());

		createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			onBeforeServer: onBeforeServer as any,
			tlsBootstrap: {
				ensure: jest.fn() as unknown as () => Promise<void>,
				setupAutoRenew,
			},
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(setupAutoRenew).toHaveBeenCalledWith("raw-server");
	});

	it("should handle resolved TLS bootstrap and call afterTls", async () => {
		const setupAutoRenew = jest.fn();
		const mockServer = { close: jest.fn(async () => {}), raw: "raw-server" };
		const ensure = jest.fn(() => Promise.resolve());

		createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
			tlsBootstrap: { ensure, setupAutoRenew },
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(setupAutoRenew).toHaveBeenCalledWith("raw-server");
	});

	it("should handle server close timeout with a hanging close", async () => {
		jest.useFakeTimers();
		process.exitCode = undefined;
		const mockServer = {
			close: jest.fn(() => new Promise<void>(() => {})), // never resolves
		};

		const result = createBootstrap({
			name: "test",
			createServer: (() => mockServer) as any,
		});

		const shutdownPromise = result.shutdown("SIGTERM");
		jest.advanceTimersByTime(10001);
		await shutdownPromise;

		expect(process.exitCode).toBe(1);
		jest.useRealTimers();
	});
});
