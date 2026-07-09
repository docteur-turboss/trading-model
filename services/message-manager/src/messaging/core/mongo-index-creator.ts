import type { MongoCollectionConfig } from "./mongo-types";

export class MongoIndexCreator {
	constructor(private readonly _config: MongoCollectionConfig) {}

	private _getCollection(): ReturnType<
		ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
	> {
		return this._config.client
			.db(this._config.dbName)
			.collection(this._config.collectionName) as ReturnType<
			ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
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
