import type { Collection, Db } from "mongodb";

import { MongoConnectionManager } from "./mongo-connection-manager";

const mongoConnectionManager = new MongoConnectionManager();

export function getDb(): Promise<Db> {
	return mongoConnectionManager.getDb();
}

export function getCollection(): Promise<Collection> {
	return mongoConnectionManager.getCollection();
}

export function isDbConnected(): boolean {
	return mongoConnectionManager.isConnected();
}

export function getMissingCriticalIndexes(): string[] {
	return mongoConnectionManager.getMissingCriticalIndexes();
}

export function resetDbState(): Promise<void> {
	return mongoConnectionManager.resetState();
}

export function closeDb(): Promise<void> {
	return mongoConnectionManager.close();
}
