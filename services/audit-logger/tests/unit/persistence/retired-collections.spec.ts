import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import {
	dropRetiredCollections,
	RETIRED_COLLECTIONS,
} from "../../../src/adapters/outbound/persistence/retired-collections";

/** A Db holding the given collections, each with its document count. */
function fakeDb(collections: Record<string, number>) {
	return {
		listCollections: jest.fn(({ name }: { name: string }) => ({
			toArray: async () => (name in collections ? [{ name }] : []),
		})),
		collection: jest.fn((name: string) => ({
			countDocuments: async () => collections[name],
		})),
		dropCollection: jest.fn<(...args: any[]) => any>(async () => true),
	};
}

describe("dropRetiredCollections", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("retires the job scheduler collection", () => {
		expect(RETIRED_COLLECTIONS).toContain("audit_jobs");
	});

	it("drops a retired collection that is empty", async () => {
		const db = fakeDb({ audit_jobs: 0 });

		await dropRetiredCollections(db as never);

		expect(db.dropCollection).toHaveBeenCalledWith("audit_jobs");
		expect(MOCK_LOGGER.info).toHaveBeenCalled();
	});

	it("keeps and reports a retired collection that holds documents", async () => {
		const db = fakeDb({ audit_jobs: 1 });

		await dropRetiredCollections(db as never);

		expect(db.dropCollection).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			expect.stringContaining("audit_jobs is not empty")
		);
	});

	it("does nothing when the collection does not exist", async () => {
		const db = fakeDb({});

		await dropRetiredCollections(db as never);

		expect(db.collection).not.toHaveBeenCalled();
		expect(db.dropCollection).not.toHaveBeenCalled();
	});
});
