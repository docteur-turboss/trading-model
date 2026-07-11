import { describe, expect, it, jest } from "@jest/globals";
import type Redis from "ioredis";

const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
}));

jest.mock("../../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const { logger } = require("../../../src/config/logger");

import {
	attachEventHandlers,
	createEventHandlers,
	detachEventHandlers,
} from "../../../src/config/redis-event-handlers";

describe("redis-event-handlers", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("createEventHandlers", () => {
		it("should create handlers that log error when redisClosed is false", () => {
			const handlers = createEventHandlers("test", () => false, []);
			handlers.onError(new Error("test error"));
			expect(logger.error).toHaveBeenCalledWith("test client error", {
				error: "test error",
			});
		});

		it("should skip error logging when redisClosed is true", () => {
			const handlers = createEventHandlers("test", () => true, []);
			handlers.onError(new Error("test error"));
			expect(logger.error).not.toHaveBeenCalled();
		});

		it("should log connect when redisClosed is false", () => {
			const handlers = createEventHandlers("test", () => false, []);
			handlers.onConnect();
			expect(logger.info).toHaveBeenCalledWith("test: connected");
		});

		it("should skip connect logging when redisClosed is true", () => {
			const handlers = createEventHandlers("test", () => true, []);
			handlers.onConnect();
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should log ready and call callbacks when redisClosed is false", () => {
			const cb1 = jest.fn();
			const cb2 = jest.fn();
			const handlers = createEventHandlers("test", () => false, [cb1, cb2]);
			handlers.onReady();
			expect(logger.info).toHaveBeenCalledWith("test: ready");
			expect(cb1).toHaveBeenCalled();
			expect(cb2).toHaveBeenCalled();
		});

		it("should skip ready logging when redisClosed is true", () => {
			const handlers = createEventHandlers("test", () => true, [jest.fn()]);
			handlers.onReady();
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should catch errors in reconnected callbacks", () => {
			const cb = jest.fn(() => {
				throw new Error("cb error");
			});
			const handlers = createEventHandlers("test", () => false, [cb]);
			handlers.onReady();
			expect(logger.debug).toHaveBeenCalledWith("Reconnected callback failed", {
				error: expect.any(Error),
			});
		});

		it("should log close when redisClosed is false", () => {
			const handlers = createEventHandlers("test", () => false, []);
			handlers.onClose();
			expect(logger.warn).toHaveBeenCalledWith("test: connection closed");
		});

		it("should skip close logging when redisClosed is true", () => {
			const handlers = createEventHandlers("test", () => true, []);
			handlers.onClose();
			expect(logger.warn).not.toHaveBeenCalled();
		});

		it("should log reconnecting when redisClosed is false", () => {
			const handlers = createEventHandlers("test", () => false, []);
			handlers.onReconnecting(1000);
			expect(logger.warn).toHaveBeenCalledWith("test: reconnecting in 1000ms");
		});

		it("should skip reconnecting logging when redisClosed is true", () => {
			const handlers = createEventHandlers("test", () => true, []);
			handlers.onReconnecting(1000);
			expect(logger.warn).not.toHaveBeenCalled();
		});
	});

	describe("attachEventHandlers", () => {
		it("should attach all event handlers to client", () => {
			const client = { on: mockOn, off: mockOff } as unknown as Redis;
			const handlers = createEventHandlers("test", () => false, []);
			attachEventHandlers(client, handlers);
			expect(mockOn).toHaveBeenCalledWith("error", handlers.onError);
			expect(mockOn).toHaveBeenCalledWith("connect", handlers.onConnect);
			expect(mockOn).toHaveBeenCalledWith("ready", handlers.onReady);
			expect(mockOn).toHaveBeenCalledWith("close", handlers.onClose);
			expect(mockOn).toHaveBeenCalledWith(
				"reconnecting",
				handlers.onReconnecting
			);
		});
	});

	describe("detachEventHandlers", () => {
		it("should detach all event handlers from client", () => {
			const client = { on: mockOn, off: mockOff } as unknown as Redis;
			const handlers = createEventHandlers("test", () => false, []);
			detachEventHandlers(client, handlers);
			expect(mockOff).toHaveBeenCalledWith("error", handlers.onError);
			expect(mockOff).toHaveBeenCalledWith("connect", handlers.onConnect);
			expect(mockOff).toHaveBeenCalledWith("ready", handlers.onReady);
			expect(mockOff).toHaveBeenCalledWith("close", handlers.onClose);
			expect(mockOff).toHaveBeenCalledWith(
				"reconnecting",
				handlers.onReconnecting
			);
		});
	});
});
