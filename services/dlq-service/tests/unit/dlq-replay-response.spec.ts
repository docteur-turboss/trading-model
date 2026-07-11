import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/audit", () => ({
	notifyAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
	},
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, status: number) => ({ data, status }),
}));

describe("dlq-replay-response", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("buildReplayResponse", () => {
		it("should build response with success count and errors", () => {
			const { buildReplayResponse } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				buildReplayResponse: (
					batchId: string,
					successCount: number,
					errors: { id: string; error: string }[]
				) => Record<string, unknown>;
			};

			const errors = [{ id: "1", error: "timeout" }];
			const result = buildReplayResponse("batch-1", 5, errors);

			expect(result).toEqual({
				batchId: "batch-1",
				replayed: 5,
				failed: 1,
				errors,
			});
		});

		it("should build response without errors when errors array is empty", () => {
			const { buildReplayResponse } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				buildReplayResponse: (
					batchId: string,
					successCount: number,
					errors: { id: string; error: string }[]
				) => Record<string, unknown>;
			};

			const result = buildReplayResponse("batch-2", 10, []);

			expect(result).toEqual({
				batchId: "batch-2",
				replayed: 10,
				failed: 0,
			});
			expect(result.errors).toBeUndefined();
		});

		it("should emit metrics with both counts", () => {
			const { buildReplayResponse } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				buildReplayResponse: (
					batchId: string,
					successCount: number,
					errors: { id: string; error: string }[]
				) => Record<string, unknown>;
			};
			const metricsMock = jest.requireMock("../../src/config/metrics") as {
				metrics: {
					entriesReplayed: { inc: jest.Mock };
					entriesReplayFailed: { inc: jest.Mock };
				};
			};

			buildReplayResponse("batch-3", 3, [{ id: "1", error: "err" }]);

			expect(metricsMock.metrics.entriesReplayed.inc).toHaveBeenCalledWith(3);
			expect(metricsMock.metrics.entriesReplayFailed.inc).toHaveBeenCalledWith(
				1
			);
		});

		it("should not emit replay metrics when counts are zero", () => {
			const { buildReplayResponse } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				buildReplayResponse: (
					batchId: string,
					successCount: number,
					errors: { id: string; error: string }[]
				) => Record<string, unknown>;
			};
			const metricsMock = jest.requireMock("../../src/config/metrics") as {
				metrics: {
					entriesReplayed: { inc: jest.Mock };
					entriesReplayFailed: { inc: jest.Mock };
				};
			};

			buildReplayResponse("batch-4", 0, []);

			expect(metricsMock.metrics.entriesReplayed.inc).not.toHaveBeenCalled();
			expect(
				metricsMock.metrics.entriesReplayFailed.inc
			).not.toHaveBeenCalled();
		});
	});

	describe("noEntriesResponse", () => {
		it("should return empty response", () => {
			const { noEntriesResponse } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				noEntriesResponse: () => {
					response: { data: unknown; status: number };
					successCount: number;
					errors: unknown[];
				};
			};

			const result = noEntriesResponse();

			expect(result.response.status).toBe(200);
			expect(result.successCount).toBe(0);
			expect(result.errors).toEqual([]);
		});
	});

	describe("notifyReplayAudit", () => {
		it("should notify audit with error severity when errors exist", () => {
			const { notifyReplayAudit } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				notifyReplayAudit: (
					batchId: string,
					topic: string | undefined,
					successCount: number,
					errorsCount: number
				) => void;
			};
			const auditMock = jest.requireMock("../../src/config/audit") as {
				notifyAudit: jest.Mock;
			};

			notifyReplayAudit("batch-5", "test-topic", 3, 1);

			expect(auditMock.notifyAudit).toHaveBeenCalled();
			const call = auditMock.notifyAudit.mock.calls[0][0];
			expect(call.severity).toBe("ERROR");
			expect(call.summary).toContain("3 succeeded, 1 failed");
		});

		it("should notify audit with info severity when no errors", () => {
			const { notifyReplayAudit } = jest.requireActual(
				"../../src/dlq/dlq-replay-response"
			) as {
				notifyReplayAudit: (
					batchId: string,
					topic: string | undefined,
					successCount: number,
					errorsCount: number
				) => void;
			};
			const auditMock = jest.requireMock("../../src/config/audit") as {
				notifyAudit: jest.Mock;
			};

			notifyReplayAudit("batch-6", undefined, 5, 0);

			expect(auditMock.notifyAudit).toHaveBeenCalled();
			const call = auditMock.notifyAudit.mock.calls[0][0];
			expect(call.severity).toBe("INFO");
		});
	});
});
