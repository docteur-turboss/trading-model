import { describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT = jest.fn();
const MOCK_VALIDATE = jest.fn();

jest.mock("../../src/adapters/outbound/repository", () => ({
	dlqRepository: { insert: MOCK_INSERT },
}));

jest.mock("../../src/adapters/inbound/dlq-validator", () => ({
	validateAddEntryBody: MOCK_VALIDATE,
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesAdded: { inc: jest.fn() },
	},
}));

jest.mock("../../src/adapters/outbound/dlq-redis-pusher", () => ({
	pushToRedisQueue: jest.fn(),
}));

jest.mock("../../src/adapters/outbound/audit-notifier", () => ({
	notifyAddAudit: jest.fn(),
}));

jest.mock("../../src/shared/dlq-error-builder", () => ({
	handleAddEntryError: jest.fn((err: unknown) => ({
		data: { error: (err as Error).message },
		status: 500,
	})),
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, status: number) => ({ data, status }),
}));

describe("add-entry-pipeline", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should add entry successfully", async () => {
		MOCK_VALIDATE.mockReturnValue({
			valid: true,
			data: { topic: "test", reason: "testing" },
		});
		MOCK_INSERT.mockResolvedValue("entry-id-123");

		const { addEntry } = jest.requireActual(
			"../../src/application/services/add-entry-pipeline"
		) as { addEntry: (req: { body: unknown }) => Promise<unknown> };

		const result = await addEntry({ body: {} });

		expect(result).toEqual({ data: { id: "entry-id-123" }, status: 201 });
	});

	it("should handle validation error", async () => {
		MOCK_VALIDATE.mockReturnValue({
			valid: false,
			response: { data: { error: "invalid" }, status: 400 },
		});

		const { addEntry } = jest.requireActual(
			"../../src/application/services/add-entry-pipeline"
		) as { addEntry: (req: { body: unknown }) => Promise<unknown> };

		const result = await addEntry({ body: {} });

		expect(result).toEqual({ data: { error: "invalid" }, status: 400 });
		expect(MOCK_INSERT).not.toHaveBeenCalled();
	});

	it("should handle insert error", async () => {
		MOCK_VALIDATE.mockReturnValue({
			valid: true,
			data: { topic: "test", reason: "testing" },
		});
		MOCK_INSERT.mockRejectedValue(new Error("db error"));

		const { addEntry } = jest.requireActual(
			"../../src/application/services/add-entry-pipeline"
		) as { addEntry: (req: { body: unknown }) => Promise<unknown> };

		const result = await addEntry({ body: {} });

		expect(result).toEqual({ data: { error: "db error" }, status: 500 });
	});
});
