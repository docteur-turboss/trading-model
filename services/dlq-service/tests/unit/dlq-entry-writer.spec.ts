import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn();
const MOCK_ESTIMATED_DOC_COUNT = jest.fn();
const MOCK_FIND_ONE = jest.fn();
const MOCK_INSERT = jest.fn();
const MOCK_COMPUTE_HASH = jest.fn();

jest.mock("../../src/config/db", () => ({
	getCollection: MOCK_GET_COLLECTION,
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
	},
}));

jest.mock("../../src/shared/entry-serializer", () => ({
	EntrySerializer: jest.fn(() => ({
		computeHash: MOCK_COMPUTE_HASH,
	})),
}));

jest.mock("../../src/adapters/outbound/dedup-inserter", () => ({
	DedupInserter: jest.fn(() => ({
		insert: MOCK_INSERT,
	})),
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("dlq-entry-writer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should export dlqCapacityError", () => {
		const { dlqCapacityError } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as { dlqCapacityError: (msg: string) => Error };
		const err = dlqCapacityError("test error");
		expect(err.message).toBe("test error");
		expect(err.name).toBe("AppError");
	});

	it("should insert entry successfully", async () => {
		const mockCol = {
			estimatedDocumentCount: MOCK_ESTIMATED_DOC_COUNT,
			findOne: MOCK_FIND_ONE,
		};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_ESTIMATED_DOC_COUNT.mockResolvedValue(50);
		MOCK_FIND_ONE.mockResolvedValue(null);
		MOCK_COMPUTE_HASH.mockReturnValue({
			messageId: "msg-1",
			contentHash: "hash-1",
		});
		MOCK_INSERT.mockResolvedValue("inserted-id");

		const { DlqEntryWriter } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as {
			DlqEntryWriter: new () => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter();
		const result = await writer.insert({
			topic: "test",
			message: { text: "hello" },
			timestamp: Date.now(),
			deliveryAttempt: 1,
		});

		expect(result).toBe("inserted-id");
	});

	it("should throw when capacity is reached", async () => {
		const mockCol = {
			estimatedDocumentCount: MOCK_ESTIMATED_DOC_COUNT,
		};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_ESTIMATED_DOC_COUNT.mockResolvedValue(100);

		const { DlqEntryWriter } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as {
			DlqEntryWriter: new () => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter();
		await expect(
			writer.insert({
				topic: "test",
				message: {},
				timestamp: Date.now(),
				deliveryAttempt: 1,
			})
		).rejects.toThrow("DLQ capacity limit reached");
	});

	it("should apply ping-pong abandon", async () => {
		const mockCol = {
			estimatedDocumentCount: MOCK_ESTIMATED_DOC_COUNT,
			findOne: MOCK_FIND_ONE,
		};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_ESTIMATED_DOC_COUNT.mockResolvedValue(50);
		MOCK_FIND_ONE.mockResolvedValue({ dlqPassCount: 5 });
		MOCK_COMPUTE_HASH.mockReturnValue({
			messageId: "msg-1",
			contentHash: "hash-1",
		});
		MOCK_INSERT.mockResolvedValue("inserted-id");

		const { DlqEntryWriter } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as {
			DlqEntryWriter: new () => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter();
		const result = await writer.insert({
			topic: "test",
			message: { text: "hello" },
			timestamp: Date.now(),
			deliveryAttempt: 1,
		});

		expect(result).toBe("inserted-id");
	});
});
