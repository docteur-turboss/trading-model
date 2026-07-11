import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("RedisEventHandlers", () => {
	let RedisEventHandlersClass: new (delegate: {
		onConnected: () => void;
		onDisconnected: () => void;
		wasEverConnected: () => boolean;
		setWasEverConnected: () => void;
	}) => {
		attach: (
			client: { on: (event: string, handler: () => void) => void },
			onReconnect: (() => void) | null
		) => void;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/redis-event-handlers") as {
			RedisEventHandlers: typeof RedisEventHandlersClass;
		};
		RedisEventHandlersClass = mod.RedisEventHandlers;
	});

	it("should attach event handlers to the client", () => {
		const delegate = {
			onConnected: jest.fn(),
			onDisconnected: jest.fn(),
			wasEverConnected: jest.fn(() => false),
			setWasEverConnected: jest.fn(),
		};
		const handlers = new RedisEventHandlersClass(delegate);
		const client = {
			on: jest.fn(),
		};

		handlers.attach(client as never, null);

		expect(client.on).toHaveBeenCalledWith("connect", expect.any(Function));
		expect(client.on).toHaveBeenCalledWith("close", expect.any(Function));
		expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
	});

	it("should call onConnected when connect event fires (first connect)", () => {
		const delegate = {
			onConnected: jest.fn(),
			onDisconnected: jest.fn(),
			wasEverConnected: jest.fn(() => false),
			setWasEverConnected: jest.fn(),
		};
		const handlers = new RedisEventHandlersClass(delegate);

		const connectHandler = jest.fn();
		const errorHandler = jest.fn();
		const closeHandler = jest.fn();
		const client = {
			on: jest
				.fn()
				.mockImplementationOnce((_event: string, fn: () => void) => {
					connectHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					closeHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					errorHandler.mockImplementation(fn);
				}),
		};

		handlers.attach(client as never, null);
		connectHandler();

		expect(delegate.onConnected).toHaveBeenCalled();
		expect(delegate.setWasEverConnected).toHaveBeenCalled();
	});

	it("should call onReconnect when connect event fires (reconnect)", () => {
		const onReconnect = jest.fn();
		const delegate = {
			onConnected: jest.fn(),
			onDisconnected: jest.fn(),
			wasEverConnected: jest.fn(() => true),
			setWasEverConnected: jest.fn(),
		};
		const handlers = new RedisEventHandlersClass(delegate);

		const connectHandler = jest.fn();
		const errorHandler = jest.fn();
		const closeHandler = jest.fn();
		const client = {
			on: jest
				.fn()
				.mockImplementationOnce((_event: string, fn: () => void) => {
					connectHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					closeHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					errorHandler.mockImplementation(fn);
				}),
		};

		handlers.attach(client as never, onReconnect);
		connectHandler();

		expect(onReconnect).toHaveBeenCalled();
	});

	it("should call onDisconnected when close event fires", () => {
		const delegate = {
			onConnected: jest.fn(),
			onDisconnected: jest.fn(),
			wasEverConnected: jest.fn(() => false),
			setWasEverConnected: jest.fn(),
		};
		const handlers = new RedisEventHandlersClass(delegate);

		const connectHandler = jest.fn();
		const closeHandler = jest.fn();
		const errorHandler = jest.fn();
		const client = {
			on: jest
				.fn()
				.mockImplementationOnce((_event: string, fn: () => void) => {
					connectHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					closeHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					errorHandler.mockImplementation(fn);
				}),
		};

		handlers.attach(client as never, null);
		closeHandler();

		expect(delegate.onDisconnected).toHaveBeenCalled();
	});

	it("should log error and call onDisconnected when error event fires", () => {
		const delegate = {
			onConnected: jest.fn(),
			onDisconnected: jest.fn(),
			wasEverConnected: jest.fn(() => false),
			setWasEverConnected: jest.fn(),
		};
		const handlers = new RedisEventHandlersClass(delegate);
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock };
		};

		const connectHandler = jest.fn();
		const errorHandler = jest.fn();
		const closeHandler = jest.fn();
		const client = {
			on: jest
				.fn()
				.mockImplementationOnce((_event: string, fn: () => void) => {
					connectHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					closeHandler.mockImplementation(fn);
				})
				.mockImplementationOnce((_event: string, fn: () => void) => {
					errorHandler.mockImplementation(fn);
				}),
		};

		handlers.attach(client as never, null);
		errorHandler(new Error("test error"));

		expect(logger.logger.error).toHaveBeenCalledWith(
			"Redis queue client error",
			{ error: "test error" }
		);
		expect(delegate.onDisconnected).toHaveBeenCalled();
	});
});
