import { describe, expect, it, jest } from "@jest/globals";
import { createAppError, ErrorCode } from "@trading-model/common/utils/errors";
import {
	failSpanOnStorageError,
	isDlqCapacityError,
	rejectSpan,
	STORAGE_UNAVAILABLE,
} from "../../src/shared/dlq-error-builder";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

function createMockSpan() {
	return {
		setStatus: jest.fn<(...args: any[]) => any>(),
		end: jest.fn<(...args: any[]) => any>(),
		recordException: jest.fn<(...args: any[]) => any>(),
	};
}

describe("dlq-error-builder", () => {
	it("names the storage failure the same for clients", () => {
		expect(STORAGE_UNAVAILABLE.code).toBe("STORAGE_UNAVAILABLE");
	});

	describe("isDlqCapacityError", () => {
		it("recognises the capacity error only", () => {
			expect(
				isDlqCapacityError(
					createAppError("full", { code: ErrorCode.DlqCapacity })
				)
			).toBe(true);
			expect(isDlqCapacityError(new Error("full"))).toBe(false);
		});
	});

	describe("rejectSpan", () => {
		it("marks the span as failed and ends it", () => {
			const span = createMockSpan();
			rejectSpan(span as never, "too big");
			expect(span.setStatus).toHaveBeenCalledWith(
				expect.objectContaining({ message: "too big" })
			);
			expect(span.end).toHaveBeenCalled();
		});
	});

	describe("failSpanOnStorageError", () => {
		it("records the exception and ends the span", () => {
			const span = createMockSpan();
			const err = new Error("db down");
			failSpanOnStorageError(span as never, err);
			expect(span.recordException).toHaveBeenCalledWith(err);
			expect(span.setStatus).toHaveBeenCalledWith(
				expect.objectContaining({ message: "db down" })
			);
			expect(span.end).toHaveBeenCalled();
		});
	});
});
