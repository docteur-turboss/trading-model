import { describe, expect, it, jest } from "@jest/globals";

const MOCK_START = jest.fn<(...args: any[]) => any>();
const MOCK_STOP = jest.fn(async (..._args: any[]) => undefined);
const MOCK_BROKER_MODULE = jest.fn((..._args: unknown[]) => ({
	listen: jest.fn<(...args: any[]) => any>(),
	startDelivery: MOCK_START,
	stopDelivery: MOCK_STOP,
}));
const MOCK_REDIS = { disconnect: jest.fn<(...args: any[]) => any>() };

jest.mock("../../../src/config/container", () => ({
	__esModule: true,
	default: MOCK_BROKER_MODULE,
}));

jest.mock("@trading-model/persistence/redis-connection-manager", () => ({
	createRedisClient: jest.fn((..._args: any[]) => MOCK_REDIS),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
		REDIS_URL: "redis://redis:6379",
		DLQ_AUTH_HMAC_SECRET: "0123456789abcdef",
		JOURNAL_MIN_REPLICAS: 1,
	},
}));

import { RedisMessageJournal } from "../../../src/adapters/outbound/redis-message-journal";
import { RedisSubscriptionStore } from "../../../src/adapters/outbound/redis-subscription-store";
import {
	closeMessageManager,
	startDelivery,
} from "../../../src/config/message-manager";

describe("config/message-manager with Redis", () => {
	it("should share the subscriptions through Redis", () => {
		expect(MOCK_BROKER_MODULE.mock.calls[0]?.[2]).toBeInstanceOf(
			RedisSubscriptionStore
		);
	});

	it("should journal the accepted messages in Redis", () => {
		expect(MOCK_BROKER_MODULE.mock.calls[0]?.[3]).toBeInstanceOf(
			RedisMessageJournal
		);
	});

	it("should start the delivery workers and stop them, waiting for the deliveries in flight, on shutdown", async () => {
		startDelivery();
		expect(MOCK_START).toHaveBeenCalledTimes(1);
		await closeMessageManager();
		expect(MOCK_STOP).toHaveBeenCalled();
	});

	it("should send the dead letters to dlq-service", () => {
		expect(MOCK_BROKER_MODULE.mock.calls[0]?.[1]).toEqual({
			dlqSecret: "0123456789abcdef",
		});
	});

	it("should close the Redis connection on shutdown", async () => {
		await closeMessageManager();
		expect(MOCK_REDIS.disconnect).toHaveBeenCalled();
	});
});
