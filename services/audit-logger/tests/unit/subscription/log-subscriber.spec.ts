import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => (req: any, _res: any, _next: any) => fn(req),
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: (err: Error) => err,
}));

jest.mock("../../../src/config/env", () => ({
	ENV: { LOG_RETENTION_DAYS: 1827 },
}));

const mockInc = jest.fn<any>();

jest.mock("../../../src/config/metrics", () => ({
	LOGS_INGESTED_TOTAL: { inc: mockInc },
	LOGS_STORED_TOTAL: { inc: mockInc },
}));

import { createLogHandler } from "../../../src/subscription/log-subscriber";

describe("log-subscriber", () => {
	const mockInsertBatch = jest.fn<any>();
	const mockLogRepo = { insertBatch: mockInsertBatch };

	beforeEach(() => {
		jest.clearAllMocks();
	});

	function callHandler(body: unknown) {
		const handler = createLogHandler(mockLogRepo as any);
		return handler(body as any, {} as any, {} as any);
	}

	it("should return 400 for invalid request body", async () => {
		const result = await callHandler({ body: { invalid: true } });
		expect(result).toHaveProperty("status", 400);
	});

	it("should store logs and return 200", async () => {
		mockInsertBatch.mockResolvedValue(undefined);
		const result = await callHandler({
			body: {
				logs: [
					{
						level: "info",
						message: "test message",
						serviceName: "svc-1",
						instanceId: "i-1",
					},
				],
			},
		});
		expect(result).toHaveProperty("status", 200);
		expect(mockInsertBatch).toHaveBeenCalled();
	});

	it("should handle error context extraction", async () => {
		mockInsertBatch.mockResolvedValue(undefined);
		const result = await callHandler({
			body: {
				logs: [
					{
						level: "error",
						message: "error occurred",
						context: { err: new Error("test error") },
					},
				],
			},
		});
		expect(result).toHaveProperty("status", 200);
	});

	it("should handle error field in log entry", async () => {
		mockInsertBatch.mockResolvedValue(undefined);
		const result = await callHandler({
			body: {
				logs: [
					{
						level: "error",
						message: "error with field",
						error: { name: "TypeError", message: "bad type" },
					},
				],
			},
		});
		expect(result).toHaveProperty("status", 200);
	});

	it("should return 503 when storage fails", async () => {
		mockInsertBatch.mockRejectedValue(new Error("DB error"));
		const result = await callHandler({
			body: { logs: [{ level: "info", message: "test" }] },
		});
		expect(result).toHaveProperty("status", 503);
	});

	it("should handle request and user fields", async () => {
		mockInsertBatch.mockResolvedValue(undefined);
		const result = await callHandler({
			body: {
				logs: [
					{
						level: "info",
						message: "with request",
						request: { method: "GET", url: "/api", statusCode: 200 },
						userId: "user-1",
						sessionId: "session-1",
					},
				],
			},
		});
		expect(result).toHaveProperty("status", 200);
	});
});
