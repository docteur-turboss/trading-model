import { describe, expect, it, jest } from "@jest/globals";

const MOCK_PUBLISH = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/config/audit", () => ({
	publishDlqEvent: MOCK_PUBLISH,
}));

type Notifier = typeof import("../../src/adapters/outbound/audit-notifier");

function load(): Notifier {
	return jest.requireActual("../../src/adapters/outbound/audit-notifier");
}

describe("audit-notifier", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("notifyAddAudit", () => {
		it("publishes the added entry", () => {
			load().notifyAddAudit("e1", "market.trade.recent.fetch" as never, "OPEN");

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entry.added", {
				entryId: "e1",
				topic: "market.trade.recent.fetch",
				reason: "OPEN",
			});
		});

		it("sends null for an unknown topic or reason", () => {
			load().notifyAddAudit("e1", undefined, undefined);

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entry.added", {
				entryId: "e1",
				topic: null,
				reason: null,
			});
		});

		it("publishes nothing for a dead-lettered DLQ event (no loop)", () => {
			load().notifyAddAudit("e1", "dlq.entry.added" as never, "TTL_EXPIRED");

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});
	});

	describe("notifyReplayAudit", () => {
		it("publishes nothing for an empty batch", () => {
			load().notifyReplayAudit({ batchId: "b1", success: 0, failed: 0 });

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});

		it("publishes the batch outcome", () => {
			load().notifyReplayAudit({
				batchId: "b1",
				topic: "t.o.p" as never,
				success: 5,
				failed: 2,
			});

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.replay.completed", {
				batchId: "b1",
				topic: "t.o.p",
				replayed: 5,
				failed: 2,
			});
		});
	});

	describe("notifyDeleteAudit", () => {
		it("publishes nothing when nothing was deleted", () => {
			load().notifyDeleteAudit(["id1"], 0);

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});

		it("publishes the deletion", () => {
			load().notifyDeleteAudit(["id1", "id2"], 2);

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entries.deleted", {
				ids: ["id1", "id2"],
				deleted: 2,
			});
		});
	});
});
