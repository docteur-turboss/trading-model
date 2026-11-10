import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { deadLetterError } from "@trading-model/broker-message/shared/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	DurationMs,
	SequenceNumber,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { Subscription } from "../../../../src/application/services/subscription";
import type { MessageDeliveryPort } from "../../../../src/domain/ports/message-delivery.port";
import {
	createMockMessage,
	mockServiceIdentity,
} from "../../../fixtures/broker.fixture";

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn((..._args: any[]) => Promise.resolve()),
}));

jest.mock("../../../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ host: string; port: number }>>()
		.mockResolvedValue({ host: "10.0.0.1", port: 8444 }),
}));

/** Runs attempts the way the delivery worker does: the next one when the entry stays pending. */
async function dispatchUntilSettled(
	subscription: Subscription,
	message: ReturnType<typeof createMockMessage>
): Promise<void> {
	for (let deliveries = 1; deliveries <= 20; deliveries++) {
		if (await subscription.deliver(message, deliveries)) {
			return;
		}
	}
}

describe("Subscription", () => {
	let mockDeliveryPort: jest.Mocked<MessageDeliveryPort>;
	let subscription: Subscription;

	beforeEach(() => {
		mockDeliveryPort = {
			send: jest.fn<MessageDeliveryPort["send"]>(),
			markDeadLetter: jest.fn<MessageDeliveryPort["markDeadLetter"]>(),
		};
		subscription = new Subscription({
			topic: "test.topic" as Topic,
			callbackPath: "message/callback",
			serviceIdentity: mockServiceIdentity,
			deliveryPort: mockDeliveryPort,
		});
	});

	describe("dispatch", () => {
		it("should deliver message via delivery port on success", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload");
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			const sendArg = mockDeliveryPort.send.mock.calls[0][0] as {
				url: string;
				message: unknown;
				context: { deliveryAttempt: number };
			};

			expect(sendArg.url).toContain("10.0.0.1");
			expect(sendArg.url).toContain("8444");
			expect(sendArg.url).toContain("message/callback");
			expect(sendArg.message).toBeDefined();
			expect(sendArg.context.deliveryAttempt).toBe(0);
		});

		it("should retry with exponential backoff on generic error with AT_LEAST_ONCE mode", async () => {
			mockDeliveryPort.send
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});

			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(3);
		});

		it("should stop retrying and send to DLQ on DeadLetterError", async () => {
			mockDeliveryPort.send.mockRejectedValue(
				deadLetterError("Unrecoverable", {
					reason: "Unrecoverable",
				})
			);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				reason: "Unrecoverable",
				deliveryAttempt: expect.any(Number),
				service: expect.any(String),
			});
		});

		it("should stop retrying and send to DLQ on TTL expiration", async () => {
			const mockDateNow = jest
				.spyOn(Date, "now")
				.mockReturnValue(new Date("2026-02-01T00:00:00Z").getTime());

			mockDeliveryPort.send.mockRejectedValue(new Error("Timeout"));

			const message = createMockMessage("payload", {
				emittedAt: Date.parse("2026-01-01T00:00:00Z") as UnixTimestamp,
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 1 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				reason: "TTL_EXPIRED",
				deliveryAttempt: expect.any(Number),
				service: expect.any(String),
			});
			mockDateNow.mockRestore();
		});

		it("should not retry with AT_MOST_ONCE mode regardless of error type", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Consumer error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtMostOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should send to DLQ on DeadLetterError even in AT_MOST_ONCE mode", async () => {
			mockDeliveryPort.send.mockRejectedValue(
				deadLetterError("Unrecoverable", {
					reason: "Unrecoverable",
				})
			);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtMostOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				reason: "Unrecoverable",
				deliveryAttempt: expect.any(Number),
				service: expect.any(String),
			});
		});

		it("should dead-letter after a single failed attempt with EXACTLY_ONCE mode", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Transient error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.ExactlyOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				service: expect.any(String),
				reason: "SINGLE_ATTEMPT_FAILED",
				deliveryAttempt: 1 as SequenceNumber,
			});
		});

		it("should route to DLQ when max retries exceeded", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Transient error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});

			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				reason: "MAX_RETRIES_EXCEEDED",
				deliveryAttempt: expect.any(Number),
				service: expect.any(String),
			});
		});

		it("should open circuit breaker after threshold failures and reject directly to DLQ", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Service down"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});

			for (let i = 0; i < 5; i++) {
				await dispatchUntilSettled(subscription, message);
			}

			mockDeliveryPort.markDeadLetter.mockClear();
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				service: expect.any(String),
				reason: "OPEN",
				deliveryAttempt: 5 as SequenceNumber,
			});
		});

		it("should reset circuit breaker on successful delivery", async () => {
			mockDeliveryPort.send
				.mockRejectedValue(new Error("Service down"))
				.mockResolvedValueOnce(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});

			await dispatchUntilSettled(subscription, message);

			mockDeliveryPort.send.mockReset();
			mockDeliveryPort.send.mockResolvedValue(undefined);

			await dispatchUntilSettled(subscription, message);
			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);

			await dispatchUntilSettled(subscription, message);
			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(2);
		});

		it("should succeed on first attempt with AT_MOST_ONCE mode", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtMostOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should succeed on first attempt with EXACTLY_ONCE mode", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.ExactlyOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should include delivery attempt context in send body", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload");
			await dispatchUntilSettled(subscription, message);

			const sendArg = mockDeliveryPort.send.mock.calls[0][0] as {
				url: string;
				message: unknown;
				context: { deliveryAttempt: number };
			};

			expect(sendArg.context).toBeDefined();
			expect(sendArg.context.deliveryAttempt).toBe(0);
		});

		it("should use default TTL=0 and AT_LEAST_ONCE when delivery is undefined", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", { delivery: undefined });
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should fallback emittedAt to 0 when not provided", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", { delivery: undefined });
			(message.metadata as any).emittedAt = undefined;
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should use NO_REASON fallback when DeadLetterError has no reason", async () => {
			mockDeliveryPort.send.mockRejectedValue(deadLetterError("Unrecoverable"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
			});
			await dispatchUntilSettled(subscription, message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith({
				message,
				reason: "NO_REASON",
				deliveryAttempt: expect.any(Number),
				service: expect.any(String),
			});
		});
	});

	describe("topic and identity", () => {
		it("should expose topic, callbackPath, and serviceIdentity", () => {
			expect(subscription.topic).toBe("test.topic");
			expect(subscription.callbackPath).toBe("message/callback");
			expect(subscription.serviceIdentity).toEqual(mockServiceIdentity);
		});
	});
});
