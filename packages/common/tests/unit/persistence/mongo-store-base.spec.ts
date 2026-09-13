import { describe, expect, it, jest } from "@jest/globals";
import type { Collection } from "mongodb";
import { MongoStoreBase } from "../../../src/persistence/mongo-store-base";

interface TestDoc {
	id: number;
	value: string;
}

class TestStore extends MongoStoreBase<TestDoc> {
	readonly exposedCollection: Collection;

	constructor(collection: Collection) {
		super(collection);
		this.exposedCollection = collection;
	}

	async ensureIndexes(): Promise<void> {}

	get collection(): Collection {
		return this.exposedCollection;
	}
}

describe("MongoStoreBase", () => {
	it("should store the collection reference", () => {
		const collection = {} as Collection;
		const store = new TestStore(collection);
		expect(store.collection).toBe(collection);
	});

	it("should insert documents", async () => {
		const insertOne = jest.fn().mockResolvedValue(undefined);
		const store = new TestStore({ insertOne } as never as Collection);
		await store.insert({ id: 1, value: "a" });
		expect(insertOne).toHaveBeenCalledWith({ id: 1, value: "a" });
	});
});
