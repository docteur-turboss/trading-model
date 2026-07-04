import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CertificateStore {
	private _client: MongoClient;
	private _collection: Collection | null = null;

	constructor(uri: string) {
		this._client = new MongoClient(uri);
	}

	async connect(): Promise<void> {
		await this._client.connect();
		const db = this._client.db();
		this._collection = db.collection("certificates");
		await this._collection.createIndex({ serialNumber: 1 }, { unique: true });
		await this._collection.createIndex({ serviceId: 1 });
		await this._collection.createIndex({ expiresAt: 1 });
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async save(cert: SignedCertificate): Promise<void> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		await this._collection.insertOne(cert);
	}

	async getBySerial(serialNumber: string): Promise<SignedCertificate | null> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const doc = await this._collection.findOne({ serialNumber });
		return doc as unknown as SignedCertificate | null;
	}

	async getByServiceId(serviceId: string): Promise<SignedCertificate | null> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const doc = await this._collection.findOne(
			{ serviceId },
			{ sort: { issuedAt: -1 } }
		);
		return doc as unknown as SignedCertificate | null;
	}

	async getExpiring(marginMs: number): Promise<SignedCertificate[]> {
		if (!this._collection) {
			throw new Error("Not connected");
		}
		const threshold = new Date(Date.now() + marginMs);
		const docs = await this._collection
			.find({ expiresAt: { $lte: threshold } })
			.toArray();
		return docs as unknown as SignedCertificate[];
	}
}
