import type { RevokedCertificate } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CrlStore {
	private readonly _client: MongoClient;
	private readonly _collection: Collection;

	private constructor(client: MongoClient, collection: Collection) {
		this._client = client;
		this._collection = collection;
	}

	static async connect(uri: string): Promise<CrlStore> {
		const client = new MongoClient(uri);
		await client.connect();
		const db = client.db();
		const collection = db.collection("crl");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		return new CrlStore(client, collection);
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async add(entry: RevokedCertificate): Promise<void> {
		await this._collection.insertOne(entry);
	}

	async getAll(): Promise<RevokedCertificate[]> {
		const docs = await this._collection.find().toArray();
		return docs as unknown as RevokedCertificate[];
	}

	async isRevoked(serialNumber: string): Promise<boolean> {
		const entry = await this._collection.findOne({ serialNumber });
		return entry !== null;
	}
}
