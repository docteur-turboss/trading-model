import { describe, expect, it, jest } from "@jest/globals";
import type { Db } from "mongodb";
import {
	MongoAuditChainReader,
	MongoChainState,
} from "../../../src/adapters/outbound/persistence/audit-chain-reader";
import { chainOf } from "../../fixtures/audit-chain";

function dbWith(collection: Record<string, unknown>): Db {
	return { collection: jest.fn(() => collection) } as unknown as Db;
}

describe("MongoAuditChainReader", () => {
	it("reads the events after a sequence, in order, by batches", async () => {
		const events = chainOf(3);
		const cursor = {
			sort: jest.fn().mockReturnThis(),
			batchSize: jest.fn().mockReturnThis(),
			async *[Symbol.asyncIterator]() {
				yield* events;
			},
		};
		const find = jest.fn(() => cursor);
		const reader = new MongoAuditChainReader(dbWith({ find }));

		const read = [];
		for await (const event of reader.eventsAfter(4)) {
			read.push(event);
		}

		expect(read).toEqual(events);
		expect(find).toHaveBeenCalledWith(
			{ chainSequence: { $gt: 4 } },
			expect.objectContaining({
				projection: expect.objectContaining({ _id: 0 }),
			})
		);
		expect(cursor.sort).toHaveBeenCalledWith({ chainSequence: 1 });
		expect(cursor.batchSize).toHaveBeenCalledWith(1000);

		for await (const _ of reader.eventsAfter(null)) {
			// drain
		}
		expect(find).toHaveBeenLastCalledWith({}, expect.anything());
	});

	it("returns the head, or null on an empty trail", async () => {
		const findOne = jest
			.fn<() => Promise<unknown>>()
			.mockResolvedValueOnce({ chainSequence: 7, dataHash: "h" })
			.mockResolvedValueOnce(null);
		const reader = new MongoAuditChainReader(dbWith({ findOne }));

		await expect(reader.head()).resolves.toEqual({
			chainSequence: 7,
			dataHash: "h",
		});
		await expect(reader.head()).resolves.toBeNull();
	});
});

describe("MongoChainState", () => {
	it("loads an empty state, then the saved one", async () => {
		const saved = {
			verified: { chainSequence: 3, dataHash: "h" },
			anchored: null,
		};
		const findOne = jest
			.fn<() => Promise<unknown>>()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ _id: "chain", ...saved });
		const replaceOne = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
		const state = new MongoChainState(dbWith({ findOne, replaceOne }));

		await expect(state.load()).resolves.toEqual({
			verified: null,
			anchored: null,
		});
		await state.save(saved);
		await expect(state.load()).resolves.toEqual(saved);
		expect(replaceOne).toHaveBeenCalledWith({ _id: "chain" }, saved, {
			upsert: true,
		});
	});
});
