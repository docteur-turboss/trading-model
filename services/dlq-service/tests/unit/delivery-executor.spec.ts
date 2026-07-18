import { describe, expect, it, jest } from "@jest/globals";

const MOCK_MARK_RETRIED = jest.fn();
const MOCK_INCREMENT_RETRY = jest.fn();
const MOCK_RELEASE_CLAIM = jest.fn();
const MOCK_IS_SHUTTING_DOWN = jest.fn();

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {},
	claimReleaseManager: {
		incrementRetryCount: MOCK_INCREMENT_RETRY,
		releaseClaimWithoutCount: MOCK_RELEASE_CLAIM,
	},
}));

jest.mock("../../src/dlq/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: MOCK_MARK_RETRIED,
	},
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

describe("delivery-executor", () => {
	let deliverEntry: (
		entry: { id: string; message: unknown },
		ctx: {
			instanceId: string;
			batchId: string;
			client: { post: jest.Mock };
			messageManagerUrl: string;
		}
	) => Promise<void>;

	const mockClient = {
		post: jest.fn(),
	};

	const baseCtx = {
		instanceId: "instance-1",
		batchId: "batch-1",
		client: mockClient,
		messageManagerUrl: "https://mm:3000",
	};

	beforeEach(() => {
		jest.clearAllMocks();
		const mod = jest.requireActual("../../src/dlq/delivery-executor") as {
			deliverEntry: typeof deliverEntry;
		};
		deliverEntry = mod.deliverEntry;
	});

	it("should deliver message and mark success", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		mockClient.post.mockResolvedValue(undefined);
		MOCK_MARK_RETRIED.mockResolvedValue(undefined);

		await deliverEntry({ id: "entry-1", message: { text: "hello" } }, baseCtx);

		expect(mockClient.post).toHaveBeenCalledWith(
			"https://mm:3000/message",
			{ text: "hello" },
			expect.objectContaining({ timeoutMs: 10000, retryCount: 3 })
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
