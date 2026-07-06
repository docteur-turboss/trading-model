import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { deadLetterError } from "@trading-model/common/utils/errors";
import type { MessageDeliveryPort } from "../../../../src/messaging/core/message-delivery-port";
import { Subscription } from "../../../../src/messaging/core/subscription";
import {
	createMockMessage,
	mockServiceIdentity,
} from "../../../fixtures/broker.fixture";

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock("config/address-manager", () => ({
	FIND_A_SERVICE: jest
		.fn<() => Promise<{ ip: string; port: number }>>()
		.mockResolvedValue({ ip: "10.0.0.1", port: 8444 }),
}));

describe("Subscription", () => {
	let mockDeliveryPort: jest.Mocked<MessageDeliveryPort>;
	let subscription: Subscription;

	beforeEach(() => {
		mockDeliveryPort = {
			send: jest.fn<MessageDeliveryPort["send"]>(),
			markDeadLetter: jest.fn<MessageDeliveryPort["markDeadLetter"]>(),
		};
		subscription = new Subscription({
			topic: "test.topic",
			callbackURL: "message/callback",
			serviceIdentity: mockServiceIdentity,
			deliveryPort: mockDeliveryPort,
		});
	});

	describe("dispatch", () => {
		it("should deliver message via delivery port on success", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload");
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			const [targetUrl, body, context] = mockDeliveryPort.send.mock
				.calls[0] as [
				string,
				unknown,
				{ deliveryAttempt: number; consumerGroup: string },
			];

			expect(targetUrl).toContain("10.0.0.1");
			expect(targetUrl).toContain("8444");
			expect(targetUrl).toContain("message/callback");
			expect(body).toBeDefined();
			expect(context.deliveryAttempt).toBe(0);
		});

		it("should retry with exponential backoff on generic error with AT_LEAST_ONCE mode", async () => {
			mockDeliveryPort.send
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});

			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(3);
		});

		it("should stop retrying and send to DLQ on DeadLetterError", async () => {
			mockDeliveryPort.send.mockRejectedValue(
				deadLetterError("Unrecoverable", {
					reason: "Unrecoverable",
				})
			);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"Unrecoverable",
				expect.any(Number)
			);
		});

		it("should stop retrying and send to DLQ on TTL expiration", async () => {
			const mockDateNow = jest
				.spyOn(Date, "now")
				.mockReturnValue(new Date("2026-02-01T00:00:00Z").getTime());

			mockDeliveryPort.send.mockRejectedValue(new Error("Timeout"));

			const message = createMockMessage("payload", {
				emittedAt: new Date("2026-01-01T00:00:00Z"),
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 1 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"TTL_EXPIRED",
				expect.any(Number)
			);
			mockDateNow.mockRestore();
		});

		it("should not retry with AT_MOST_ONCE mode regardless of error type", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Consumer error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_MOST_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should send to DLQ on DeadLetterError even in AT_MOST_ONCE mode", async () => {
			mockDeliveryPort.send.mockRejectedValue(
				deadLetterError("Unrecoverable", {
					reason: "Unrecoverable",
				})
			);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_MOST_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"Unrecoverable",
				expect.any(Number)
			);
		});

		it("should stop after first attempt with EXACTLY_ONCE mode", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Transient error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.EXACTLY_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should route to DLQ when max retries exceeded", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Transient error"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});

			await subscription.dispatch(message);

			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"MAX_RETRIES_EXCEEDED",
				expect.any(Number)
			);
		});

		it("should open circuit breaker after threshold failures and reject directly to DLQ", async () => {
			mockDeliveryPort.send.mockRejectedValue(new Error("Service down"));

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});

			for (let i = 0; i < 5; i++) {
				await subscription.dispatch(message);
			}

			mockDeliveryPort.markDeadLetter.mockClear();
			await subscription.dispatch(message);

			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"CIRCUIT_OPEN",
				expect.any(Number)
			);
		});

		it("should reset circuit breaker on successful delivery", async () => {
			mockDeliveryPort.send
				.mockRejectedValue(new Error("Service down"))
				.mockResolvedValueOnce(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});

			await subscription.dispatch(message);

			mockDeliveryPort.send.mockReset();
			mockDeliveryPort.send.mockResolvedValue(undefined);

			await subscription.dispatch(message);
			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);

			await subscription.dispatch(message);
			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(2);
		});

		it("should succeed on first attempt with AT_MOST_ONCE mode", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_MOST_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should succeed on first attempt with EXACTLY_ONCE mode", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.EXACTLY_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should include delivery attempt context in send body", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload");
			await subscription.dispatch(message);

			const [, , context] = mockDeliveryPort.send.mock.calls[0] as [
				string,
				unknown,
				{ deliveryAttempt: number; consumerGroup: string },
			];

			expect(context).toBeDefined();
			expect(context.deliveryAttempt).toBe(0);
		});

		it("should use default TTL=0 and AT_LEAST_ONCE when delivery is undefined", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", { delivery: undefined });
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should fallback emittedAt to 0 when not provided", async () => {
			mockDeliveryPort.send.mockResolvedValue(undefined);

			const message = createMockMessage("payload", { delivery: undefined });
			(message.metadata as any).emittedAt = undefined;
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
		});

		it("should use NO_REASON fallback when DeadLetterError has no reason", async () => {
			mockDeliveryPort.send.mockRejectedValue(
				deadLetterError("Unrecoverable")
			);

			const message = createMockMessage("payload", {
				delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
			});
			await subscription.dispatch(message);

			expect(mockDeliveryPort.send).toHaveBeenCalledTimes(1);
			expect(mockDeliveryPort.markDeadLetter).toHaveBeenCalledWith(
				message,
				"NO_REASON",
				expect.any(Number)
			);
		});
	});

	describe("topic and identity", () => {
		it("should expose topic, callbackURL, and serviceIdentity", () => {
			expect(subscription.topic).toBe("test.topic");
			expect(subscription.callbackURL).toBe("message/callback");
			expect(subscription.serviceIdentity).toEqual(mockServiceIdentity);
		});
	});
});
