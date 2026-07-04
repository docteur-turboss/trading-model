import type { CaMetadata } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CaStore {
	private _client: MongoClient;
	private _collection: Collection | null = null;

	constructor(uri: string) {
		this._client = new MongoClient(uri);
	}

	async connect(): Promise<void> {
		await this._client.connect();
		const db = this._client.db();
		this._collection = db.collection("ca_store");
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async save(metadata: CaMetadata): Promise<void> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		await this._collection.insertOne(metadata);
	}

	async getLatest(): Promise<CaMetadata | null> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const doc = await this._collection.findOne({}, { sort: { createdAt: -1 } });
		return doc as unknown as CaMetadata | null;
	}
}
