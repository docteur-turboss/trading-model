import { describe, expect, it, jest } from "@jest/globals";

const MOCK_FORWARD = jest.fn(async () => undefined);
const MOCK_START = jest.fn();
const MOCK_STOP = jest.fn(async () => undefined);
const MOCK_BROKER_MODULE = jest.fn((..._args: unknown[]) => ({
	listen: jest.fn(),
	forwardDeadLetters: MOCK_FORWARD,
	startDelivery: MOCK_START,
	stopDelivery: MOCK_STOP,
}));
const MOCK_REDIS = { disconnect: jest.fn() };

jest.mock("../../../src/config/container", () => ({
	__esModule: true,
	default: MOCK_BROKER_MODULE,
}));

jest.mock("@trading-model/persistence/redis-connection-manager", () => ({
	createRedisClient: jest.fn(() => MOCK_REDIS),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
		REDIS_URL: "redis://redis:6379",
		DLQ_LOCAL_FALLBACK_PATH: "/var/lib/mm/dlq.jsonl",
		DLQ_AUTH_HMAC_SECRET: "0123456789abcdef",
		DLQ_FORWARD_INTERVAL_MS: 60_000,
		JOURNAL_MIN_REPLICAS: 1,
	},
}));

import { RedisMessageJournal } from "../../../src/adapters/outbound/redis-message-journal";
import { RedisSubscriptionStore } from "../../../src/adapters/outbound/redis-subscription-store";
import {
	closeMessageManager,
	startDeadLetterForwarding,
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

	it("should send the dead letters to dlq-service, keeping the file as fallback", () => {
		expect(MOCK_BROKER_MODULE.mock.calls[0]?.[1]).toEqual({
			filePath: "/var/lib/mm/dlq.jsonl",
			dlqSecret: "0123456789abcdef",
		});
	});

	it("should close the Redis connection on shutdown", async () => {
		await closeMessageManager();
		expect(MOCK_REDIS.disconnect).toHaveBeenCalled();
	});

	// The file is on a volume that does not outlive the pod.
	it("should forward the local dead letters a last time on shutdown", async () => {
		MOCK_FORWARD.mockClear();
		await closeMessageManager();
		expect(MOCK_FORWARD).toHaveBeenCalledTimes(1);
	});

	it("should forward the local dead letters at start, then periodically", async () => {
		jest.useFakeTimers();
		MOCK_FORWARD.mockClear();
		startDeadLetterForwarding();
		expect(MOCK_FORWARD).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(60_000);
		expect(MOCK_FORWARD).toHaveBeenCalledTimes(2);
		await closeMessageManager();
		await jest.advanceTimersByTimeAsync(120_000);
		expect(MOCK_FORWARD).toHaveBeenCalledTimes(3);
		jest.useRealTimers();
	});

	it("should log, not throw, when forwarding fails", async () => {
		MOCK_FORWARD.mockRejectedValueOnce(new Error("disk"));
		await expect(closeMessageManager()).resolves.toBeUndefined();
	});
});
