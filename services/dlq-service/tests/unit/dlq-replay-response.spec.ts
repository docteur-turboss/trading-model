import { describe, expect, it, jest } from "@jest/globals";

describe("dlq-replay-response", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("buildReplayResponse", () => {
		it("should build response with success count and errors", () => {
			const { buildReplayResponse } = jest.requireActual(
				"../../src/application/use-cases/dlq-replay-response"
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
				"../../src/application/use-cases/dlq-replay-response"
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
	});
});
