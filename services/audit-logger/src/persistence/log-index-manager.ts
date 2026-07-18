import type { Db } from "mongodb";

export async function ensureLogIndexes(db: Db): Promise<void> {
	const collection = db.collection("service_logs");
	await collection.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
	await collection.createIndex({ "service.name": 1, receivedAt: -1 });
	await collection.createIndex({ level: 1, receivedAt: -1 });
	await collection.createIndex({ correlationId: 1 });
	await collection.createIndex({ receivedAt: -1 });
}
