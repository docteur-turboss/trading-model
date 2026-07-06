import type { CaMetadata } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CaStore {
	private readonly _client: MongoClient;
	private readonly _collection: Collection;

	private constructor(client: MongoClient, collection: Collection) {
		this._client = client;
		this._collection = collection;
	}

	static async connect(uri: string): Promise<CaStore> {
		const client = new MongoClient(uri);
		await client.connect();
		const db = client.db();
		const collection = db.collection("ca_store");
		return new CaStore(client, collection);
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async save(metadata: CaMetadata): Promise<void> {
		await this._collection.insertOne(metadata);
	}

	async add(metadata: CaMetadata): Promise<void> {
		await this.save(metadata);
	}

	async getLatest(): Promise<CaMetadata | null> {
		const doc = await this._collection.findOne({}, { sort: { createdAt: -1 } });
		return doc as unknown as CaMetadata | null;
	}
}
