jest.mock("@trading-model/http/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/http/response-exception", () => {
	const sendResponse = (data: any, status: number) => ({ status, data });
	return { sendResponse };
});

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createMessageHandler } from "../../../src/adapters/inbound/subscription/audit-subscriber";
import type { AuditRepository } from "../../../src/adapters/outbound/persistence/audit-repository";

describe("AuditSubscriber", () => {
	let mockRepo: jest.Mocked<AuditRepository>;
	let handler: (...args: any[]) => any;

	beforeEach(() => {
		mockRepo = {
			insert: jest.fn<(...args: any[]) => any>(),
			findById: jest.fn<(...args: any[]) => any>(),
			query: jest.fn<(...args: any[]) => any>(),
			getStats: jest.fn<(...args: any[]) => any>(),
			ensureIndexes: jest.fn<(...args: any[]) => any>(),
		} as unknown as jest.Mocked<AuditRepository>;

		handler = createMessageHandler(mockRepo, 90);
	});

	describe("message handling", () => {
		it("should reject a message without messageId and write nothing", async () => {
			await expect(handler({ metadata: { topic: "t" } })).rejects.toThrow(
				"no messageId"
			);
			expect(mockRepo.insert).not.toHaveBeenCalled();
		});

		it("should record a delivered message", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const message = {
				metadata: {
					topic: "order.created",
					eventType: "OrderCreated",
					messageId: "msg-123",
					correlationId: "corr-456",
					emittedAt: "2024-06-01T12:00:00Z",
					publisher: {
						serviceName: "order-service",
						instanceId: "instance-1",
					},
				},
				payload: { orderId: "ord-1" },
				context: { deliveryAttempt: 1 },
			};

			await handler(message);

			expect(mockRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					ttl: expect.any(Date),
					dataHash: expect.any(String),
					metadata: expect.objectContaining({
						topic: "order.created" as any,
						eventType: "OrderCreated" as any,
						publisher: "order-service" as any,
						instanceId: "instance-1" as any,
						messageId: "msg-123" as any,
						correlationId: "corr-456" as any,
					}),
					payload: { orderId: "ord-1" },
				})
			);
		});

		it("should accept a flat envelope format", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const message = {
				metadata: {
					topic: "trade.executed",
					messageId: "m-0",
					publisher: {
						serviceName: "trade-service",
						instanceId: "instance-2",
					},
				},
				payload: { tradeId: "t-1" },
			};

			await handler(message);

			expect(mockRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						topic: "trade.executed" as any,
						publisher: "trade-service" as any,
						instanceId: "instance-2" as any,
					}),
					payload: { tradeId: "t-1" },
				})
			);
		});

		it("should handle missing publisher gracefully", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const message = {
				metadata: {
					topic: "test.topic",
					messageId: "m-1",
				},
				payload: {},
			};

			await handler(message);

			expect(mockRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						publisher: "unknown" as any,
						instanceId: "unknown" as any,
					}),
				})
			);
		});

		it("should use current date when emittedAt is not provided", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const before = Date.now();

			const message = {
				metadata: {
					topic: "test.topic",
					messageId: "m-1",
				},
				payload: {},
			};

			await handler(message);

			const insertCall = (mockRepo.insert as jest.Mock<(...args: any[]) => any>)
				.mock.calls[0][0] as any;
			expect(insertCall.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
		});
	});
});
