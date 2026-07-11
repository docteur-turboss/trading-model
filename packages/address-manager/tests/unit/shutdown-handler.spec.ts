import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ShutdownHandler } from "../../src/shutdown-handler";
import type { ShutdownHandlerDeps } from "../../src/types";

jest.mock("@trading-model/common/server/signal-handler", () => ({
	setupProcessHandlers:
		jest.fn<
			(shutdown: () => Promise<void>, hardShutdown: () => void) => void
		>(),
	removeProcessHandlers: jest.fn<() => void>(),
}));

function createMockDeps(): jest.Mocked<ShutdownHandlerDeps> {
	return {
		registrationManager: {
			shouldRetryRegistration: true,
		},
		wsClient: {
			disconnect: jest.fn<() => void>(),
		} as never,
		addressManagerClient: {
			unregisterService: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
		} as never,
		serviceCache: {
			stop: jest.fn<() => void>(),
		} as never,
		circuitBreaker: {
			clear: jest.fn<() => void>(),
		} as never,
	};
}

describe("ShutdownHandler", () => {
	let handler: ShutdownHandler;
	let deps: ReturnType<typeof createMockDeps>;

	beforeEach(() => {
		deps = createMockDeps();
		handler = new ShutdownHandler(deps);
		jest.clearAllMocks();
	});

	it("shutdown() should set shouldRetryRegistration to false", () => {
		expect(deps.registrationManager.shouldRetryRegistration).toBe(true);
		handler.shutdown();
		expect(deps.registrationManager.shouldRetryRegistration).toBe(false);
	});

	it("fullStop() should disconnect, unregister, stop cache, clear circuit breaker", async () => {
		await handler.fullStop();
		expect(deps.wsClient!.disconnect).toHaveBeenCalledTimes(1);
		expect(deps.addressManagerClient.unregisterService).toHaveBeenCalledTimes(
			1
		);
		expect(deps.serviceCache.stop).toHaveBeenCalledTimes(1);
		expect(deps.circuitBreaker.clear).toHaveBeenCalledTimes(1);
	});

	it("fullStop() should handle unregisterService error gracefully", async () => {
		deps.addressManagerClient.unregisterService.mockRejectedValue(
			new Error("unregister error")
		);
		await expect(handler.fullStop()).resolves.toBeUndefined();
	});

	it("fullStop() should not throw when wsClient is undefined", async () => {
		deps.wsClient = undefined as never;
		await expect(handler.fullStop()).resolves.toBeUndefined();
	});

	it("setupSignalHandlers() should register handlers", () => {
		const scheduler = { stop: jest.fn<() => void>() };
		handler.setupSignalHandlers(scheduler);
		const {
			setupProcessHandlers,
		} = require("@trading-model/common/server/signal-handler");
		expect(setupProcessHandlers).toHaveBeenCalledTimes(1);
	});

	it("setupSignalHandlers() called twice should not double-register", () => {
		const scheduler = { stop: jest.fn<() => void>() };
		handler.setupSignalHandlers(scheduler);
		handler.setupSignalHandlers(scheduler);
		const {
			setupProcessHandlers,
		} = require("@trading-model/common/server/signal-handler");
		expect(setupProcessHandlers).toHaveBeenCalledTimes(1);
	});

	it("setupSignalHandlers() graceful shutdown callback should stop scheduler and fullStop", async () => {
		const scheduler = { stop: jest.fn<() => void>() };
		handler.setupSignalHandlers(scheduler);
		const {
			setupProcessHandlers,
		} = require("@trading-model/common/server/signal-handler");
		const shutdownFn = (setupProcessHandlers as jest.Mock).mock
			.calls[0][0] as () => Promise<void>;
		await shutdownFn();
		expect(scheduler.stop).toHaveBeenCalled();
		expect(deps.wsClient!.disconnect).toHaveBeenCalled();
		expect(deps.addressManagerClient.unregisterService).toHaveBeenCalled();
	});

	it("removeSignalHandlers() should remove handlers", () => {
		const scheduler = { stop: jest.fn<() => void>() };
		handler.setupSignalHandlers(scheduler);
		handler.removeSignalHandlers();
		const {
			removeProcessHandlers,
		} = require("@trading-model/common/server/signal-handler");
		expect(removeProcessHandlers).toHaveBeenCalledTimes(1);
	});

	it("removeSignalHandlers() should be safe when not registered", () => {
		expect(() => handler.removeSignalHandlers()).not.toThrow();
	});
});
