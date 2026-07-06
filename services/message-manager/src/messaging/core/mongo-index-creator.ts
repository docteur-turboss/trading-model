import type { MongoClient } from "./mongo-archive-batch";

export class MongoIndexCreator {
	constructor(
		private readonly _client: MongoClient,
		private readonly _dbName: string,
		private readonly _collectionName: string
	) {}

	private _getCollection(): ReturnType<
		ReturnType<MongoClient["db"]>["collection"]
	> {
		return this._client
			.db(this._dbName)
			.collection(this._collectionName) as ReturnType<
			ReturnType<MongoClient["db"]>["collection"]
		>;
	}

	async createIndexes(): Promise<void> {
		const col = this._getCollection();
		await col.createIndex({ messageId: 1 }, { unique: true, background: true });
		await col.createIndex({ topic: 1, archivedAt: -1 }, { background: true });
		await col.createIndex(
			{ ttl: 1 },
			{ expireAfterSeconds: 0, background: true }
		);
	}
}
