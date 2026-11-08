import { describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT = jest.fn<(...args: any[]) => any>();
const MOCK_VALIDATE = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/config/dlq-adapters", () => ({
	dlqRepository: { insert: MOCK_INSERT },
	pushToRedisQueue: jest.fn<(...args: any[]) => any>(),
	notifyAddAudit: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/application/use-cases/dlq-validator", () => ({
	checkEntryAcceptable: MOCK_VALIDATE,
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesAdded: { inc: jest.fn<(...args: any[]) => any>() },
	},
}));

jest.mock("../../src/shared/dlq-error-builder", () => ({
	handleAddEntryError: jest.fn((err: unknown) => ({
		data: { error: (err as Error).message },
		status: 500,
	})),
}));

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => ({
	sendResponse: (data: unknown, status: number) => ({ data, status }),
}));

describe("add-entry-pipeline", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should add entry successfully", async () => {
		MOCK_VALIDATE.mockReturnValue({ valid: true });
		MOCK_INSERT.mockResolvedValue("entry-id-123");

		const { addEntry } = jest.requireActual(
			"../../src/application/use-cases/add-entry-pipeline"
		) as { addEntry: (entry: unknown) => Promise<unknown> };

		const result = await addEntry({ topic: "test", reason: "testing" });

		expect(result).toEqual({ data: { id: "entry-id-123" }, status: 201 });
	});

	it("should return the rejection of the size or storage check", async () => {
		MOCK_VALIDATE.mockReturnValue({
			valid: false,
			response: { data: { error: "invalid" }, status: 400 },
		});

		const { addEntry } = jest.requireActual(
			"../../src/application/use-cases/add-entry-pipeline"
		) as { addEntry: (entry: unknown) => Promise<unknown> };

		const result = await addEntry({ topic: "test", reason: "testing" });

		expect(result).toEqual({ data: { error: "invalid" }, status: 400 });
		expect(MOCK_INSERT).not.toHaveBeenCalled();
	});

	it("should handle insert error", async () => {
		MOCK_VALIDATE.mockReturnValue({ valid: true });
		MOCK_INSERT.mockRejectedValue(new Error("db error"));

		const { addEntry } = jest.requireActual(
			"../../src/application/use-cases/add-entry-pipeline"
		) as { addEntry: (entry: unknown) => Promise<unknown> };

		const result = await addEntry({ topic: "test", reason: "testing" });

		expect(result).toEqual({ data: { error: "db error" }, status: 500 });
	});
});
