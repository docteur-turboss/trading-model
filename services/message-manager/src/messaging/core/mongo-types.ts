import type { MongoClient } from "mongodb";

export interface MongoCollectionConfig {
	client: MongoClient;
	dbName: string;
	collectionName: string;
}
