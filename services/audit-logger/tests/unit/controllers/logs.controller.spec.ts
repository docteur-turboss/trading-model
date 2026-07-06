import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => (req: any, _res: any, _next: any) => fn(req),
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
}));

import { DateRange } from "@trading-model/common/domain/date-range";
import { getLogsController } from "../../../src/controllers/logs.controller";

describe("logs.controller", () => {
	const mockQuery = jest.fn<any>();
	const mockGetStats = jest.fn<any>();
	const mockGetById = jest.fn<any>();
	const mockLogRepo = {
		query: mockQuery,
		getStats: mockGetStats,
		getById: mockGetById,
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return listLogs handler", async () => {
		mockQuery.mockResolvedValue({ docs: [], total: 0, page: 1, limit: 50 });
		const controller = getLogsController(mockLogRepo as any);
		const result = await controller.listLogs(
			{ query: {} } as any,
			{} as any,
			{} as any
		);
		expect(result as any).toEqual({
			status: 200,
			data: { docs: [], total: 0, page: 1, limit: 50 },
		});
	});

	it("should call query with parsed params", async () => {
		mockQuery.mockResolvedValue({ docs: [], total: 0, page: 1, limit: 10 });
		const controller = getLogsController(mockLogRepo as any);
		await controller.listLogs(
			{
				query: {
					serviceName: "svc-1",
					level: "error",
					correlationId: "cid-1",
					startDate: "2024-01-01",
					endDate: "2024-12-31",
					search: "timeout",
					page: "2",
					limit: "20",
				},
			} as any,
			{} as any,
			{} as any
		);
		expect(mockQuery).toHaveBeenCalledWith({
			serviceName: "svc-1",
			level: "error",
			correlationId: "cid-1",
			dateRange: new DateRange(new Date("2024-01-01"), new Date("2024-12-31")),
			search: "timeout",
			page: 2,
			limit: 20,
		});
	});

	it("should return getLogStats handler", async () => {
		mockGetStats.mockResolvedValue({
			total: 100,
			byService: {},
			byLevel: {},
			dateRange: {},
		});
		const controller = getLogsController(mockLogRepo as any);
		const result = await controller.getLogStats(
			{} as any,
			{} as any,
			{} as any
		);
		expect((result as any).status).toBe(200);
	});

	it("should return getLogById handler with found doc", async () => {
		mockGetById.mockResolvedValue({ message: "found" });
		const controller = getLogsController(mockLogRepo as any);
		const result = await controller.getLogById(
			{ params: { id: "abc123" } } as any,
			{} as any,
			{} as any
		);
		expect((result as any).status).toBe(200);
	});

	it("should return 404 when log not found", async () => {
		mockGetById.mockResolvedValue(null);
		const controller = getLogsController(mockLogRepo as any);
		const result = await controller.getLogById(
			{ params: { id: "missing" } } as any,
			{} as any,
			{} as any
		);
		expect((result as any).status).toBe(404);
	});
});
