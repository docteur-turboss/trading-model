import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const MOCK_DELIVER_ENTRY = jest.fn<() => Promise<void>>();

jest.mock("../../src/adapters/outbound/delivery-executor", () => ({
	deliverEntry: MOCK_DELIVER_ENTRY,
}));

jest.mock("../../src/dlq/shared/http-client-manager", () => ({
	getHttpClient: async () => ({}),
}));

jest.mock("../../src/config/logger", () => ({
	logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/infrastructure/batch-concurrency-guard", () => ({
	checkBatchRejection: () => null,
	incrementActiveBatches: jest.fn(),
	decrementActiveBatches: jest.fn(),
	recordBatchResult: jest.fn(),
}));

describe("replay-batch", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(global, "setTimeout").mockImplementation(() => 0);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	async function runReplay(deliver: (id: string) => Promise<void>) {
		MOCK_DELIVER_ENTRY.mockImplementation((entry: { id: string }) =>
			deliver(entry.id)
		);
		const { doReplayBatch } = jest.requireActual(
			"../../src/application/services/replay-batch"
		) as {
			doReplayBatch: (options: {
				batchId: string;
				instanceId: string;
				messageManagerUrl: string;
				entries: { id: string; message: unknown }[];
			}) => Promise<{
				success: number;
				errors: { id: string; error: string }[];
			}>;
		};
		return doReplayBatch({
			batchId: "batch-1",
			instanceId: "instance-1",
			messageManagerUrl: "https://message-manager:3000",
			entries: [
				{ id: "entry-1", message: {} },
				{ id: "entry-2", message: {} },
				{ id: "entry-3", message: {} },
			],
		});
	}

	it("should count every delivered entry as success and report no errors", async () => {
		const result = await runReplay(() => Promise.resolve());

		expect(result.success).toBe(3);
		expect(result.errors).toHaveLength(0);
	});

	it("should count failed entries exactly once in errors and exclude them from success", async () => {
		const result = await runReplay((id) =>
			id === "entry-1" ? Promise.reject(new Error("boom")) : Promise.resolve()
		);

		expect(result.success).toBe(2);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toEqual({ id: "entry-1", error: "boom" });
	});

	it("should not double-count when every entry fails", async () => {
		const result = await runReplay(() => Promise.reject(new Error("boom")));

		expect(result.success).toBe(0);
		expect(result.errors).toHaveLength(3);
		expect(new Set(result.errors.map((err) => err.id)).size).toBe(3);
	});
});
