import { describe, expect, it, jest } from "@jest/globals";

const MOCK_PUBLISH = jest.fn<(...args: any[]) => Promise<boolean>>();

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
		MOCK_PUBLISH.mockResolvedValue(true);
	});

	describe("notifyAddAudit", () => {
		it("publishes the added entry with its actor", () => {
			load().notifyAddAudit(
				"e1",
				"market.trade.recent.fetch" as never,
				"OPEN",
				"ops-alice"
			);

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entry.added", {
				entryId: "e1",
				topic: "market.trade.recent.fetch",
				reason: "OPEN",
				actor: "ops-alice",
			});
		});

		it("sends null for an unknown topic, reason or actor", () => {
			load().notifyAddAudit("e1", undefined, undefined, null);

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entry.added", {
				entryId: "e1",
				topic: null,
				reason: null,
				actor: null,
			});
		});

		it("publishes nothing for a dead-lettered DLQ event (no loop)", () => {
			load().notifyAddAudit(
				"e1",
				"dlq.entry.added" as never,
				"TTL_EXPIRED",
				null
			);

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});
	});

	describe("notifyReplayAudit", () => {
		it("publishes nothing for an empty batch, and has nothing to miss", async () => {
			await expect(
				load().notifyReplayAudit({
					batchId: "b1",
					success: 0,
					failed: 0,
					actor: null,
				})
			).resolves.toBe(true);

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});

		it("publishes the batch outcome and its actor", async () => {
			await load().notifyReplayAudit({
				batchId: "b1",
				topic: "t.o.p" as never,
				success: 5,
				failed: 2,
				actor: "ops-alice",
			});

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.replay.completed", {
				batchId: "b1",
				topic: "t.o.p",
				replayed: 5,
				failed: 2,
				actor: "ops-alice",
			});
		});

		it("reports a refused event", async () => {
			MOCK_PUBLISH.mockResolvedValue(false);

			await expect(
				load().notifyReplayAudit({
					batchId: "b1",
					success: 1,
					failed: 0,
					actor: "ops-alice",
				})
			).resolves.toBe(false);
		});
	});

	describe("notifyDeleteAudit", () => {
		it("publishes nothing when nothing was deleted", async () => {
			await expect(load().notifyDeleteAudit(["id1"], 0, null)).resolves.toBe(
				true
			);

			expect(MOCK_PUBLISH).not.toHaveBeenCalled();
		});

		it("publishes the deletion and its actor", async () => {
			await load().notifyDeleteAudit(["id1", "id2"], 2, "ops-alice");

			expect(MOCK_PUBLISH).toHaveBeenCalledWith("dlq.entries.deleted", {
				ids: ["id1", "id2"],
				deleted: 2,
				actor: "ops-alice",
			});
		});

		it("reports a refused event", async () => {
			MOCK_PUBLISH.mockResolvedValue(false);

			await expect(
				load().notifyDeleteAudit(["id1"], 1, "ops-alice")
			).resolves.toBe(false);
		});
	});
});
