import { describe, expect, it, jest } from "@jest/globals";

const MOCK_NOTIFY_AUDIT = jest.fn();
jest.mock("../../src/config/audit", () => ({
	notifyAudit: MOCK_NOTIFY_AUDIT,
}));

describe("audit-notifier", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("notifyAddAudit", () => {
		it("should notify audit on add with topic and reason", () => {
			const { notifyAddAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as {
				notifyAddAudit: (
					id: string,
					topic: string | undefined,
					reason: string | undefined
				) => void;
			};
			notifyAddAudit("test-id", "test.topic", "timeout");

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					correlationId: expect.stringContaining("test-id"),
					summary: "DLQ entry added: timeout",
				})
			);
		});

		it("should notify audit on add without topic and reason", () => {
			const { notifyAddAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as {
				notifyAddAudit: (
					id: string,
					topic: string | undefined,
					reason: string | undefined
				) => void;
			};
			notifyAddAudit("test-id", undefined, undefined);

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: "DLQ entry added: no reason",
				})
			);
		});
	});

	describe("notifyReplayAudit", () => {
		it("should skip when success and failed are 0", () => {
			const { notifyReplayAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as {
				notifyReplayAudit: (result: {
					batchId: string;
					topic?: string;
					success: number;
					failed: number;
				}) => void;
			};
			notifyReplayAudit({ batchId: "b1", success: 0, failed: 0 });

			expect(MOCK_NOTIFY_AUDIT).not.toHaveBeenCalled();
		});

		it("should notify on success", () => {
			const { notifyReplayAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as {
				notifyReplayAudit: (result: {
					batchId: string;
					topic?: string;
					success: number;
					failed: number;
				}) => void;
			};
			notifyReplayAudit({ batchId: "b1", topic: "t1", success: 5, failed: 0 });

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: "DLQ replay: 5 succeeded, 0 failed",
				})
			);
		});

		it("should notify on failure", () => {
			const { notifyReplayAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as {
				notifyReplayAudit: (result: {
					batchId: string;
					topic?: string;
					success: number;
					failed: number;
				}) => void;
			};
			notifyReplayAudit({ batchId: "b2", success: 2, failed: 3 });

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: "DLQ replay: 2 succeeded, 3 failed",
				})
			);
		});
	});

	describe("notifyAbandonAudit", () => {
		it("should skip when count is 0", () => {
			const { notifyAbandonAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as { notifyAbandonAudit: (count: number) => void };
			notifyAbandonAudit(0);

			expect(MOCK_NOTIFY_AUDIT).not.toHaveBeenCalled();
		});

		it("should notify on abandon", () => {
			const { notifyAbandonAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as { notifyAbandonAudit: (count: number) => void };
			notifyAbandonAudit(5);

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: "5 DLQ entries abandoned after max retries",
				})
			);
		});
	});

	describe("notifyDeleteAudit", () => {
		it("should skip when deleted is 0", () => {
			const { notifyDeleteAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as { notifyDeleteAudit: (ids: string[], deleted: number) => void };
			notifyDeleteAudit(["id1"], 0);

			expect(MOCK_NOTIFY_AUDIT).not.toHaveBeenCalled();
		});

		it("should notify on delete", () => {
			const { notifyDeleteAudit } = jest.requireActual(
				"../../src/dlq/audit-notifier"
			) as { notifyDeleteAudit: (ids: string[], deleted: number) => void };
			notifyDeleteAudit(["id1", "id2"], 2);

			expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalledWith(
				expect.objectContaining({
					summary: "2 DLQ entries deleted",
				})
			);
		});
	});
});
