import type { Collection } from "mongodb";
import type { PaginationResult } from "../domain/pagination";
import type { MongoRepository } from "./mongo-repository.interface";

export abstract class MongoStoreBase<TDoc = unknown>
	implements MongoRepository<TDoc>
{
	protected readonly _collection: Collection;

	protected constructor(collection: Collection) {
		this._collection = collection;
	}

	async insert(doc: TDoc): Promise<void> {
		await this._collection.insertOne(doc as never);
	}

	async insertBatch(docs: TDoc[]): Promise<void> {
		if (docs.length > 0) {
			await this._collection.insertMany(docs as never[]);
		}
	}

	async findById(id: string): Promise<TDoc | null> {
		const doc = await this._collection.findOne({ _id: id } as never);
		return doc as unknown as TDoc | null;
	}

	async ensureIndexes(): Promise<void> {}

	async query(query: Record<string, unknown>): Promise<PaginationResult<TDoc>> {
		const data = (await this._collection
			.find(query)
			.toArray()) as unknown as TDoc[];
		return {
			docs: data,
			total: data.length,
			page: 1 as never,
			limit: data.length as never,
		};
	}

	async disconnect(): Promise<void> {}
}
