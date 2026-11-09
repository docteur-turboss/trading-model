import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const MOCK_DELIVER_ENTRY = jest.fn<(entry: { id: string }) => Promise<void>>();

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		debug: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/application/services/batch-concurrency-guard", () => ({
	checkBatchRejection: () => null,
	recordBatchResult: jest.fn<(...args: any[]) => any>(),
}));

describe("replay-batch", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(global, "setTimeout").mockImplementation((() => 0) as never);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	async function runReplay(deliver: (id: string) => Promise<void>) {
		MOCK_DELIVER_ENTRY.mockImplementation((entry: { id: string }) =>
			deliver(entry.id)
		);
		const { createReplayBatch } = jest.requireActual(
			"../../src/application/services/replay-batch"
		) as {
			createReplayBatch: (delivery: {
				deliver: typeof MOCK_DELIVER_ENTRY;
			}) => (options: {
				batchId: string;
				instanceId: string;
				messageManagerUrl: string;
				entries: { id: string; message: unknown }[];
			}) => Promise<{
				success: number;
				errors: { id: string; error: string }[];
			}>;
		};
		const doReplayBatch = createReplayBatch({ deliver: MOCK_DELIVER_ENTRY });
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

	it("clears the timeout timer once the batch ends, even when delivery fails", async () => {
		jest.spyOn(global, "setTimeout").mockImplementation((() => 42) as never);
		const clear = jest
			.spyOn(global, "clearTimeout")
			.mockImplementation(() => undefined);
		const { logger } = jest.requireMock(
			"@trading-model/http/infrastructure/logger"
		) as {
			logger: { warn: jest.Mock<(...args: any[]) => any> };
		};

		await runReplay(() => Promise.reject(new Error("boom")));

		expect(clear).toHaveBeenCalledWith(42);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("warns and still drains in-flight deliveries when the batch outlives the timeout", async () => {
		let fire: () => void = () => undefined;
		jest.spyOn(global, "setTimeout").mockImplementation(((cb: () => void) => {
			fire = cb;
			return 7;
		}) as never);
		jest.spyOn(global, "clearTimeout").mockImplementation(() => undefined);
		const { logger } = jest.requireMock(
			"@trading-model/http/infrastructure/logger"
		) as {
			logger: { warn: jest.Mock<(...args: any[]) => any> };
		};
		let release: () => void = () => undefined;
		const gate = new Promise<void>((r) => {
			release = r;
		});

		const pending = runReplay(() => gate);
		await Promise.resolve();
		fire();
		release();
		const result = await pending;

		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("DLQ batch replay timeout"),
			{ batchId: "batch-1" }
		);
		expect(result.success).toBe(3);
	});

	it("counts the batch as in flight until its deliveries end (shutdown drain)", async () => {
		const { activeReplays } = jest.requireActual(
			"../../src/application/services/active-replay-counter"
		) as { activeReplays: { count: number } };
		const during: number[] = [];

		await runReplay(() => {
			during.push(activeReplays.count);
			return Promise.resolve();
		});

		expect(during).toEqual([1, 1, 1]);
		expect(activeReplays.count).toBe(0);
	});
});
