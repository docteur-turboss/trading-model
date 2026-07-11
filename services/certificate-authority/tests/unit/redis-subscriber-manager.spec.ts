import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

import { RedisSubscriberManager } from "../../src/persistence/redis-subscriber-manager";

describe("RedisSubscriberManager", () => {
	let manager: RedisSubscriberManager;
	let mockSubscriber: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriber = {
			duplicate: jest.fn(),
			on: jest.fn(),
			subscribe: jest.fn().mockResolvedValue(undefined),
			unsubscribe: jest.fn().mockResolvedValue(undefined),
			removeListener: jest.fn(),
			quit: jest.fn().mockResolvedValue(undefined),
		};
		manager = new RedisSubscriberManager(mockSubscriber);
	});

	it("should subscribe to a channel and return an unsubscriber", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);

		const unsub = await manager.subscribe("test-channel", jest.fn());
		expect(mockSubscriber.duplicate).toHaveBeenCalled();
		expect(mockSubscriber.subscribe).toHaveBeenCalledWith("test-channel");
		expect(mockSubscriber.on).toHaveBeenCalledWith(
			"message",
			expect.any(Function)
		);
		expect(unsub).toBeDefined();
		expect(typeof unsub).toBe("function");
	});

	it("should call handler when message is received", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);
		const handler = jest.fn();

		await manager.subscribe("test-channel", handler);

		const messageHandler = mockSubscriber.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		expect(messageHandler).toBeDefined();

		messageHandler("test-channel", "hello");
		expect(handler).toHaveBeenCalledWith("hello");
	});

	it("should not call handler after unsubscribe", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);
		const handler = jest.fn();

		const unsub = await manager.subscribe("test-channel", handler);
		const messageHandler = mockSubscriber.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];

		unsub();
		messageHandler("test-channel", "hello");
		expect(handler).not.toHaveBeenCalled();
	});

	it("should call removeListener, unsubscribe and quit on unsub", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);

		const unsub = await manager.subscribe("test-channel", jest.fn());
		unsub();

		expect(mockSubscriber.removeListener).toHaveBeenCalledWith(
			"message",
			expect.any(Function)
		);
		expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("test-channel");
		expect(mockSubscriber.quit).toHaveBeenCalled();
	});

	it("should set up reconnect handler", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);

		await manager.subscribe("test-channel", jest.fn());

		const reconnectHandler = mockSubscriber.on.mock.calls.find(
			(c: string[]) => c[0] === "reconnecting"
		)?.[1];
		expect(reconnectHandler).toBeDefined();
		reconnectHandler();
	});

	it("should set up connect handler", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);

		await manager.subscribe("test-channel", jest.fn());

		const connectHandler = mockSubscriber.on.mock.calls.find(
			(c: string[]) => c[0] === "connect"
		)?.[1];
		expect(connectHandler).toBeDefined();
	});

	it("should handle subscribe failure gracefully", async () => {
		mockSubscriber.duplicate.mockReturnValue(mockSubscriber);
		mockSubscriber.subscribe.mockRejectedValue(new Error("Redis error"));

		const unsub = await manager.subscribe("test-channel", jest.fn());
		expect(unsub).toBeDefined();
		expect(typeof unsub).toBe("function");
	});

	it("should configure retry strategy on duplicate", async () => {
		let retryStrategy: ((times: number) => number | null) | null = null;
		mockSubscriber.duplicate.mockImplementation((opts: any) => {
			retryStrategy = opts.retryStrategy;
			return mockSubscriber;
		});

		await manager.subscribe("test-channel", jest.fn());

		expect(retryStrategy).not.toBeNull();
		expect(retryStrategy!(11)).toBeNull();
		expect(retryStrategy!(1)).toBe(1000);
		expect(retryStrategy!(5)).toBe(5000);
	});
});
