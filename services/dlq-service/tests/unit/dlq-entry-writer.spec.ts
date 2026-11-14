import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn<(...args: any[]) => any>();
const MOCK_ESTIMATED_DOC_COUNT = jest.fn<(...args: any[]) => any>();
const MOCK_FIND_ONE = jest.fn<(...args: any[]) => any>();
const MOCK_INSERT = jest.fn<(...args: any[]) => any>();
const MOCK_COMPUTE_HASH = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
	},
}));

jest.mock("../../src/shared/entry-serializer", () => ({
	EntrySerializer: jest.fn((..._args: any[]) => ({
		computeHash: MOCK_COMPUTE_HASH,
	})),
}));

jest.mock("../../src/adapters/outbound/dedup-inserter", () => ({
	DedupInserter: jest.fn((..._args: any[]) => ({
		insert: MOCK_INSERT,
	})),
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
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
			DlqEntryWriter: new (
				getCollection: never
			) => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter(MOCK_GET_COLLECTION as never);
		const result = await writer.insert({
			topic: "test",
			message: { text: "hello" },
			timestamp: Date.now(),
			deliveryAttempt: 1,
		});

		expect(result).toBe("inserted-id");
	});

	it("should throw when capacity is reached", async () => {
		const insertOne = jest.fn<(...args: any[]) => any>();
		const mockCol = {
			estimatedDocumentCount: MOCK_ESTIMATED_DOC_COUNT,
			findOne: jest.fn<(...args: any[]) => any>().mockResolvedValue(null),
			insertOne,
		};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_ESTIMATED_DOC_COUNT.mockResolvedValue(100);

		const { DlqEntryWriter } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as {
			DlqEntryWriter: new (
				getCollection: never
			) => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter(MOCK_GET_COLLECTION as never);
		await expect(
			writer.insert({
				topic: "test",
				message: {},
				timestamp: Date.now(),
				deliveryAttempt: 1,
			})
		).rejects.toThrow("DLQ capacity limit reached");
		expect(insertOne).not.toHaveBeenCalled();
	});

	it("should apply ping-pong abandon", async () => {
		const mockCol = {
			estimatedDocumentCount: MOCK_ESTIMATED_DOC_COUNT,
			findOne: MOCK_FIND_ONE,
		};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_ESTIMATED_DOC_COUNT.mockResolvedValue(50);
		MOCK_FIND_ONE.mockResolvedValueOnce({ dlqPassCount: 5 });
		MOCK_FIND_ONE.mockResolvedValueOnce(null);
		MOCK_COMPUTE_HASH.mockReturnValue({
			messageId: "msg-1",
			contentHash: "hash-1",
		});
		MOCK_INSERT.mockResolvedValue("inserted-id");

		const { DlqEntryWriter } = jest.requireActual(
			"../../src/adapters/outbound/dlq-entry-writer"
		) as {
			DlqEntryWriter: new (
				getCollection: never
			) => {
				insert: (entry: Record<string, unknown>) => Promise<string>;
			};
		};

		const writer = new DlqEntryWriter(MOCK_GET_COLLECTION as never);
		const result = await writer.insert({
			topic: "test",
			message: { text: "hello" },
			timestamp: Date.now(),
			deliveryAttempt: 1,
		});

		expect(result).toBe("inserted-id");
	});
});
