import type { RevokedCertificate } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CrlStore {
	private _client: MongoClient;
	private _collection: Collection | null = null;

	constructor(uri: string) {
		this._client = new MongoClient(uri);
	}

	async connect(): Promise<void> {
		await this._client.connect();
		const db = this._client.db();
		this._collection = db.collection("crl");
		await this._collection.createIndex({ serialNumber: 1 }, { unique: true });
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async add(entry: RevokedCertificate): Promise<void> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		await this._collection.insertOne(entry);
	}

	async getAll(): Promise<RevokedCertificate[]> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const docs = await this._collection.find().toArray();
		return docs as unknown as RevokedCertificate[];
	}

	async isRevoked(serialNumber: string): Promise<boolean> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const entry = await this._collection.findOne({ serialNumber });
		return entry !== null;
	}
}
