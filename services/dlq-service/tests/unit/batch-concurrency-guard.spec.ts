import { describe, expect, it, jest } from "@jest/globals";

let mockCircuitOpen = false;
let mockRecordSuccess: jest.Mock;
let mockRecordFailure: jest.Mock;

const mockDefaultConfig = {
	failureThreshold: 5,
	cooldownMs: 30_000,
};

jest.mock("@trading-model/reliability/circuit-state-machine", () => ({
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
			"../../src/application/services/batch-concurrency-guard"
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
		const { checkBatchRejection } = jest.requireActual(
			"../../src/application/services/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};
		const { activeReplays } = jest.requireActual(
			"../../src/application/services/active-replay-counter"
		) as { activeReplays: { increment: () => void } };

		activeReplays.increment();
		activeReplays.increment();

		const result = checkBatchRejection([{ id: "1" }], "batch-1");

		expect(result).not.toBeNull();
		expect(result!.success).toBe(0);
		expect(result!.errors[0].error).toBe("Too many concurrent replay batches");
	});

	it("should reject when circuit breaker is open", () => {
		mockCircuitOpen = true;

		const { checkBatchRejection } = jest.requireActual(
			"../../src/application/services/batch-concurrency-guard"
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
			"../../src/application/services/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};

		const result = checkBatchRejection([], "batch-1");

		expect(result).toBeNull();
	});

	it("should reject from the active replay count", () => {
		const { checkBatchRejection } = jest.requireActual(
			"../../src/application/services/batch-concurrency-guard"
		) as {
			checkBatchRejection: (
				entries: { id: string }[],
				batchId: string
			) => { success: number; errors: { id: string; error: string }[] } | null;
		};
		const { activeReplays } = jest.requireActual(
			"../../src/application/services/active-replay-counter"
		) as { activeReplays: { increment: () => void; decrement: () => void } };

		activeReplays.increment();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).toBeNull();

		activeReplays.increment();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).not.toBeNull();

		activeReplays.decrement();
		expect(checkBatchRejection([{ id: "1" }], "batch-1")).toBeNull();
	});

	it("should record success on recordBatchResult with success > 0", () => {
		const { recordBatchResult } = jest.requireActual(
			"../../src/application/services/batch-concurrency-guard"
		) as {
			recordBatchResult: (success: number) => void;
		};

		recordBatchResult(5);

		expect(mockRecordSuccess).toHaveBeenCalled();
	});

	it("should record failure on recordBatchResult with success = 0", () => {
		const { recordBatchResult } = jest.requireActual(
			"../../src/application/services/batch-concurrency-guard"
		) as {
			recordBatchResult: (success: number) => void;
		};

		recordBatchResult(0);

		expect(mockRecordFailure).toHaveBeenCalled();
	});
});
