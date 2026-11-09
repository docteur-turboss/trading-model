import { describe, expect, it, jest } from "@jest/globals";
import { createAppError, ErrorCode } from "@trading-model/common/utils/errors";
import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import {
	type AddEntryDeps,
	createAddEntry,
} from "../../src/application/use-cases/add-entry-pipeline";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: { error: jest.fn<(...args: any[]) => any>() },
}));

const ENTRY = {
	topic: "test",
	reason: "testing",
	message: { a: 1 },
} as never as DlqEntry;

function setup(storageAvailable = true) {
	const insert = jest.fn<(entry: DlqEntry) => Promise<string>>(
		async () => "entry-id-123"
	);
	const enqueue = jest.fn<(id: string) => Promise<void>>(async () => undefined);
	const entryAdded = jest.fn<() => void>();
	const notifyAdd = jest.fn<(...args: any[]) => void>();
	const deps: AddEntryDeps = {
		entries: { insert, delete: async () => 0 },
		storage: { isAvailable: () => storageAvailable },
		queue: { enqueue },
		metrics: { entryAdded },
		audit: { notifyAdd },
	};
	return {
		addEntry: createAddEntry(deps),
		insert,
		enqueue,
		entryAdded,
		notifyAdd,
	};
}

describe("addEntry use case", () => {
	it("stores, counts, enqueues and audits the entry", async () => {
		const { addEntry, entryAdded, enqueue, notifyAdd } = setup();

		await expect(addEntry(ENTRY)).resolves.toEqual({
			status: "added",
			id: "entry-id-123",
		});
		expect(entryAdded).toHaveBeenCalled();
		expect(enqueue).toHaveBeenCalledWith("entry-id-123");
		expect(notifyAdd).toHaveBeenCalledWith("entry-id-123", "test", "testing");
	});

	it("rejects without writing when storage is unavailable", async () => {
		const { addEntry, insert } = setup(false);

		await expect(addEntry(ENTRY)).resolves.toEqual({
			status: "rejected",
			reason: "storage-unavailable",
		});
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects a payload over 5MB", async () => {
		const { addEntry, insert } = setup();

		await expect(
			addEntry({ ...ENTRY, message: "x".repeat(5 * 1024 * 1024 + 1) } as never)
		).resolves.toEqual({ status: "rejected", reason: "too-large" });
		expect(insert).not.toHaveBeenCalled();
	});

	it("reports a full DLQ", async () => {
		const { addEntry, insert, enqueue } = setup();
		insert.mockRejectedValue(
			createAppError("full", { code: ErrorCode.DlqCapacity })
		);

		await expect(addEntry(ENTRY)).resolves.toEqual({
			status: "capacity-reached",
		});
		expect(enqueue).not.toHaveBeenCalled();
	});

	it("reports any other storage failure", async () => {
		const { addEntry, insert, entryAdded } = setup();
		insert.mockRejectedValue(new Error("db error"));

		await expect(addEntry(ENTRY)).resolves.toEqual({ status: "storage-error" });
		expect(entryAdded).not.toHaveBeenCalled();
	});
});
