import { describe, expect, it, jest } from "@jest/globals";

const MOCK_MARK_RETRIED = jest.fn<(...args: any[]) => any>();
const MOCK_INCREMENT_RETRY = jest.fn<(...args: any[]) => any>();
const MOCK_RELEASE_CLAIM = jest.fn<(...args: any[]) => any>();
const MOCK_IS_SHUTTING_DOWN = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

describe("delivery-executor", () => {
	let deliverEntry: (
		entry: { id: string; message: unknown; service?: string | null },
		ctx: {
			instanceId: string;
			batchId: string;
			client: { post: jest.Mock<(...args: any[]) => any> };
			messageManagerUrl: string;
			retryManager: { markRetried: typeof MOCK_MARK_RETRIED };
			claimRelease: {
				incrementRetryCount: typeof MOCK_INCREMENT_RETRY;
				releaseClaimWithoutCount: typeof MOCK_RELEASE_CLAIM;
			};
		}
	) => Promise<void>;

	const mockClient = {
		post: jest.fn<(...args: any[]) => any>(),
	};

	const baseCtx = {
		instanceId: "instance-1",
		batchId: "batch-1",
		client: mockClient,
		messageManagerUrl: "https://mm:3000",
		retryManager: { markRetried: MOCK_MARK_RETRIED },
		claimRelease: {
			incrementRetryCount: MOCK_INCREMENT_RETRY,
			releaseClaimWithoutCount: MOCK_RELEASE_CLAIM,
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		const mod = jest.requireActual(
			"../../src/adapters/outbound/delivery-executor"
		) as {
			deliverEntry: typeof deliverEntry;
		};
		deliverEntry = mod.deliverEntry;
	});

	it("should replay to the one failed service through the targeted route (ADR-0043)", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockResolvedValue(undefined);
		MOCK_MARK_RETRIED.mockResolvedValue(undefined);

		await deliverEntry(
			{ id: "entry-1", message: { text: "hello" }, service: "audit-logger" },
			baseCtx
		);

		expect(mockClient.post).toHaveBeenCalledWith(
			"https://mm:3000/message/replay",
			{ service: "audit-logger", message: { text: "hello" } },
			expect.anything()
		);
	});

	it("should deliver message and mark success", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockResolvedValue(undefined);
		MOCK_MARK_RETRIED.mockResolvedValue(undefined);

		await deliverEntry({ id: "entry-1", message: { text: "hello" } }, baseCtx);

		expect(mockClient.post).toHaveBeenCalledWith(
			"https://mm:3000/message",
			{ text: "hello" },
			expect.objectContaining({ timeoutMs: 20_000 })
		);
		expect(MOCK_MARK_RETRIED).toHaveBeenCalledWith(
			expect.objectContaining({ id: "entry-1", success: true })
		);
	});

	it("should throw on delivery failure and mark retried as failed", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockRejectedValue(new Error("delivery failed"));
		MOCK_MARK_RETRIED.mockResolvedValue(undefined);

		await expect(
			deliverEntry({ id: "entry-1", message: {} }, baseCtx)
		).rejects.toThrow("delivery failed");

		expect(MOCK_MARK_RETRIED).toHaveBeenCalledWith(
			expect.objectContaining({ id: "entry-1", success: false })
		);
	});

	it("should force release claim when markRetried also fails", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockRejectedValue(new Error("delivery failed"));
		MOCK_MARK_RETRIED.mockRejectedValue(new Error("mark failed"));
		MOCK_INCREMENT_RETRY.mockResolvedValue(undefined);
		MOCK_RELEASE_CLAIM.mockResolvedValue(undefined);

		await expect(
			deliverEntry({ id: "entry-1", message: {} }, baseCtx)
		).rejects.toThrow("delivery failed");

		expect(MOCK_INCREMENT_RETRY).toHaveBeenCalledWith("entry-1");
		expect(MOCK_RELEASE_CLAIM).toHaveBeenCalledWith("entry-1");
	});

	it("should handle CRITICAL errors during force release gracefully", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockRejectedValue(new Error("delivery failed"));
		MOCK_MARK_RETRIED.mockRejectedValue(new Error("mark failed"));
		MOCK_INCREMENT_RETRY.mockRejectedValue(new Error("increment failed"));
		MOCK_RELEASE_CLAIM.mockRejectedValue(new Error("release failed"));

		await expect(
			deliverEntry({ id: "entry-1", message: {} }, baseCtx)
		).rejects.toThrow("delivery failed");
	});

	it("should throw when server is shutting down", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(true);

		await expect(
			deliverEntry({ id: "entry-1", message: {} }, baseCtx)
		).rejects.toThrow("Server shutting down");

		expect(mockClient.post).not.toHaveBeenCalled();
	});
});
