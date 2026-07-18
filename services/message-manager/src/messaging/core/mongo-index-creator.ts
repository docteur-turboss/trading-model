import type { MongoCollectionConfig } from "./mongo-types";

function _getCollection(
	config: MongoCollectionConfig
): ReturnType<ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]> {
	return config.client
		.db(config.dbName)
		.collection(config.collectionName) as ReturnType<
		ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
	>;
}

export async function createMongoIndexes(
	config: MongoCollectionConfig
): Promise<void> {
	const col = _getCollection(config);
	await col.createIndex({ messageId: 1 }, { unique: true, background: true });
	await col.createIndex({ topic: 1, archivedAt: -1 }, { background: true });
	await col.createIndex(
		{ ttl: 1 },
		{ expireAfterSeconds: 0, background: true }
	);
}
