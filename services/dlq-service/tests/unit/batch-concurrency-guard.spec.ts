import { describe, expect, it, jest } from "@jest/globals";

let mockCircuitOpen = false;
let mockRecordSuccess: jest.Mock;
let mockRecordFailure: jest.Mock;

const mockDefaultConfig = {
	failureThreshold: 5,
	cooldownMs: 30_000,
};

jest.mock("@trading-model/common/reliability/circuit-state-machine", () => ({
	CircuitStateMachine: Object.assign(
		jest.fn(() => ({
			isOpen: () => mockCircuitOpen,
			recordSuccess: mockRecordSuccess,
			recordFailure: mockRecordFailure,
		})),
		{ defaultConfig: () => mockDefaultConfig }
	),
}));

describe("batch-concurrency-guard", () => {
	beforeEach(() => {
		jest.resetModules();
		mockCircuitOpen = false;
		mockRecordSuccess = jest.fn();
		mockRecordFailure = jest.fn();
	});

	it("should return null when batches are within limit and circuit is closed", () => {
		const { checkBatchRejection } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};

		const result = checkBatchRejection([{ id: "1" }], "batch-1");

		expect(result).toBeNull();
	});

	it("should reject when too many concurrent batches", () => {
		const { checkBatchRejection, incrementActiveBatches } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
			incrementActiveBatches: () => void;
		};

		incrementActiveBatches();
		incrementActiveBatches();

		const result = checkBatchRejection([{ id: "1" }], "batch-1");

		expect(result).not.toBeNull();
		expect(result!.success).toBe(0);
		expect(result!.errors[0].error).toBe("Too many concurrent replay batches");
	});

	it("should reject when circuit breaker is open", () => {
		mockCircuitOpen = true;

		const { checkBatchRejection } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};

		const result = checkBatchRejection([{ id: "1" }], "batch-1");

		expect(result).not.toBeNull();
		expect(result!.errors[0].error).toBe(
			"Message-manager circuit breaker open"
		);
	});

	it("should not reject when circuit is open but no entries", () => {
		mockCircuitOpen = true;

		const { checkBatchRejection } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};

		const result = checkBatchRejection([], "batch-1");

		expect(result).toBeNull();
	});

	it("should increment and decrement active batch count", () => {
		const {
			incrementActiveBatches,
			decrementActiveBatches,
			checkBatchRejection,
		} = jest.requireActual("../../src/dlq/batch-concurrency-guard") as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
			incrementActiveBatches: () => void;
			decrementActiveBatches: () => void;
		};

		incrementActiveBatches();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).toBeNull();

		incrementActiveBatches();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).not.toBeNull();

		decrementActiveBatches();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).toBeNull();
	});

	it("should record success on recordBatchResult with success > 0", () => {
		const { recordBatchResult } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			recordBatchResult: (success: number) => void;
		};

		recordBatchResult(5);

		expect(mockRecordSuccess).toHaveBeenCalled();
	});

	it("should record failure on recordBatchResult with success = 0", () => {
		const { recordBatchResult } = jest.requireActual(
			"../../src/dlq/batch-concurrency-guard"
		) as {
			recordBatchResult: (success: number) => void;
		};

		recordBatchResult(0);

		expect(mockRecordFailure).toHaveBeenCalled();
	});
});
