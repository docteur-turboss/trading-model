import { describe, expect, it, jest } from "@jest/globals";

const MOCK_SET_STATUS = jest.fn();
const MOCK_SET_ATTRIBUTE = jest.fn();
const MOCK_END = jest.fn();
const mockSpan = {
	setStatus: MOCK_SET_STATUS,
	setAttribute: MOCK_SET_ATTRIBUTE,
	end: MOCK_END,
};

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, status: number) => ({ data, status }),
}));

describe("dlq-replay-validator", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should validate a valid query with all fields", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		const result = validateReplayQuery(
			{ topic: "test-topic", limit: "25" },
			mockSpan as never
		);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data).toEqual({ topic: "test-topic", limit: 25 });
		}
		expect(MOCK_SET_ATTRIBUTE).toHaveBeenCalledWith("topic", "test-topic");
		expect(MOCK_SET_ATTRIBUTE).toHaveBeenCalledWith("limit", 25);
	});

	it("should validate a query with default limit", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		const result = validateReplayQuery({}, mockSpan as never);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data).toEqual({ limit: 50 });
		}
	});

	it("should use 'all' as topic when topic is not provided", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		validateReplayQuery({}, mockSpan as never);

		expect(MOCK_SET_ATTRIBUTE).toHaveBeenCalledWith("topic", "all");
	});

	it("should return validation error for invalid query", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		const result = validateReplayQuery({ limit: -1 }, mockSpan as never);

		expect(result.valid).toBe(false);
		expect(MOCK_SET_STATUS).toHaveBeenCalledWith({
			code: 2,
			message: expect.any(String),
		});
		expect(MOCK_END).toHaveBeenCalled();
	});

	it("should return validation error for non-numeric limit", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		const result = validateReplayQuery({ limit: "abc" }, mockSpan as never);

		expect(result.valid).toBe(false);
	});

	it("should return validation error for limit exceeding max", () => {
		const { validateReplayQuery } = jest.requireActual(
			"../../src/dlq/dlq-replay-validator"
		) as {
			validateReplayQuery: (
				query: unknown,
				span: typeof mockSpan
			) => { valid: boolean; data?: unknown; response?: unknown };
		};

		const result = validateReplayQuery({ limit: 200 }, mockSpan as never);

		expect(result.valid).toBe(false);
	});
});
