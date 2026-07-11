import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createNext, createReq, createRes } from "../../helpers/express";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => {
	const sendResponse = (data: any, status: number) => ({ status, data });
	return { sendResponse };
});

import type { AuditRepository } from "../../../src/persistence/audit-repository";
import { createMessageHandler } from "../../../src/subscription/audit-subscriber";

describe("AuditSubscriber", () => {
	let mockRepo: jest.Mocked<AuditRepository>;
	let handler: ReturnType<typeof createMessageHandler>;

	beforeEach(() => {
		mockRepo = {
			insert: jest.fn(),
			insertBatch: jest.fn(),
			findById: jest.fn(),
			query: jest.fn(),
			getStats: jest.fn(),
			ensureIndexes: jest.fn(),
		} as unknown as jest.Mocked<AuditRepository>;

		handler = createMessageHandler(mockRepo);
	});

	describe("message handling", () => {
		it("should accept a message in nested envelope format and return 200", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const req = createReq({
				body: {
					message: {
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
					},
					context: { deliveryAttempt: 1, consumerGroup: "audit-group" },
				},
			});

			const result = await handler(req, createRes(), createNext);

			expect(mockRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
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
			expect(result).toMatchObject({
				status: 200,
				data: { status: "recorded" },
			});
		});

		it("should accept a flat envelope format", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const req = createReq({
				body: {
					metadata: {
						topic: "trade.executed",
						publisher: {
							serviceName: "trade-service",
							instanceId: "instance-2",
						},
					},
					payload: { tradeId: "t-1" },
				},
			});

			const result = await handler(req, createRes(), createNext);

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
			expect(result).toMatchObject({ status: 200 });
		});

		it("should return 400 when no topic is present", async () => {
			const req = createReq({
				body: { message: { metadata: {}, payload: {} } },
			});

			const result = await handler(req, createRes(), createNext);

			expect(mockRepo.insert).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 400,
				data: { error: "Invalid message format: no topic" },
			});
		});

		it("should return 400 when body has no message and no metadata", async () => {
			const req = createReq({
				body: { random: "data" },
			});

			const result = await handler(req, createRes(), createNext);

			expect(mockRepo.insert).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				status: 400,
				data: { error: "Invalid message format: no topic" },
			});
		});

		it("should handle missing publisher gracefully", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const req = createReq({
				body: {
					metadata: {
						topic: "test.topic",
					},
					payload: {},
				},
			});

			const result = await handler(req, createRes(), createNext);

			expect(mockRepo.insert).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						publisher: "unknown" as any,
						instanceId: "unknown" as any,
					}),
				})
			);
			expect(result).toMatchObject({ status: 200 });
		});

		it("should use current date when emittedAt is not provided", async () => {
			mockRepo.insert.mockResolvedValue(undefined);

			const before = Date.now();

			const req = createReq({
				body: {
					metadata: {
						topic: "test.topic",
					},
					payload: {},
				},
			});

			await handler(req, createRes(), createNext);

			const insertCall = (mockRepo.insert as jest.Mock).mock.calls[0][0] as any;
			expect(insertCall.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
		});
	});
});
