import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DateRange } from "@trading-model/common/domain/date-range";

import { createNext, createReq, createRes } from "../../helpers/express";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => {
	const sendResponse = (data: any, status: number) => ({ status, data });
	return { sendResponse };
});

import { createEventsController } from "../../../src/controllers/events.controller";
import type { AuditRepository } from "../../../src/persistence/audit-repository";

describe("EventsController", () => {
	let mockRepo: jest.Mocked<AuditRepository>;
	let controller: ReturnType<typeof createEventsController>;

	beforeEach(() => {
		mockRepo = {
			insert: jest.fn(),
			insertBatch: jest.fn(),
			findById: jest.fn(),
			query: jest.fn(),
			getStats: jest.fn(),
			ensureIndexes: jest.fn(),
		} as unknown as jest.Mocked<AuditRepository>;

		controller = createEventsController(mockRepo);
	});

	describe("listEvents", () => {
		it("should return paginated events with query params", async () => {
			const mockResult = {
				docs: [],
				total: 0,
				page: 1,
				limit: 100,
			};
			mockRepo.query.mockResolvedValue(mockResult);

			const result = await controller.listEvents(
				createReq({ query: { topic: "test", page: "1", limit: "50" } }),
				createRes(),
				createNext
			);

			expect(mockRepo.query).toHaveBeenCalledWith({
				topic: "test",
				publisher: undefined,
				correlationId: undefined,
				dateRange: undefined,
				page: 1,
				limit: 50,
			});
			expect(result).toMatchObject({ status: 200, data: mockResult });
		});

		it("should parse date params", async () => {
			mockRepo.query.mockResolvedValue({
				docs: [],
				total: 0,
				page: 1,
				limit: 100,
			});

			await controller.listEvents(
				createReq({
					query: { startDate: "2024-01-01", endDate: "2024-12-31" },
				}),
				createRes(),
				createNext
			);

			const callArgs = mockRepo.query.mock.calls[0][0];
			const dateRange = callArgs.dateRange!;
			expect(dateRange).toBeInstanceOf(DateRange);
			expect(dateRange.start).toEqual(new Date("2024-01-01"));
			expect(dateRange.end).toEqual(new Date("2024-12-31"));
		});

		it("should handle missing query params gracefully", async () => {
			mockRepo.query.mockResolvedValue({
				docs: [],
				total: 0,
				page: 1,
				limit: 100,
			});

			const result = await controller.listEvents(
				createReq({ query: {} }),
				createRes(),
				createNext
			);

			expect(mockRepo.query).toHaveBeenCalledWith({
				topic: undefined,
				publisher: undefined,
				correlationId: undefined,
				dateRange: undefined,
				page: undefined,
				limit: undefined,
			});
			expect(result).toMatchObject({ status: 200 });
		});
	});

	describe("getEvent", () => {
		it("should return 200 with the event when found", async () => {
			const mockEvent = { metadata: { messageId: "msg-1" } } as any;
			mockRepo.findById.mockResolvedValue(mockEvent);

			const result = await controller.getEvent(
				createReq({ params: { messageId: "msg-1" } }),
				createRes(),
				createNext
			);

			expect(mockRepo.findById).toHaveBeenCalledWith("msg-1");
			expect(result).toMatchObject({ status: 200, data: mockEvent });
		});

		it("should return 404 when event not found", async () => {
			mockRepo.findById.mockResolvedValue(null);

			const result = await controller.getEvent(
				createReq({ params: { messageId: "nonexistent" } }),
				createRes(),
				createNext
			);

			expect(result).toMatchObject({
				status: 404,
				data: { error: "Event not found" },
			});
		});
	});

	describe("getStats", () => {
		it("should return 200 with audit stats", async () => {
			const mockStats = { totalEvents: 42 } as any;
			mockRepo.getStats.mockResolvedValue(mockStats);

			const result = await controller.getStats(
				createReq(),
				createRes(),
				createNext
			);

			expect(mockRepo.getStats).toHaveBeenCalledTimes(1);
			expect(result).toMatchObject({ status: 200, data: mockStats });
		});
	});
});
