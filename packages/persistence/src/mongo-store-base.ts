import type { Collection } from "mongodb";

export abstract class MongoStoreBase<TDoc = unknown> {
	protected readonly _collection: Collection;

	protected constructor(collection: Collection) {
		this._collection = collection;
	}

	async insert(doc: TDoc): Promise<void> {
		await this._collection.insertOne(doc as never);
	}

	abstract ensureIndexes(): Promise<void>;
}
