import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { type Collection, MongoClient } from "mongodb";

export class CertificateStore {
	private readonly _client: MongoClient;
	private readonly _collection: Collection;

	private constructor(client: MongoClient, collection: Collection) {
		this._client = client;
		this._collection = collection;
	}

	static async connect(uri: string): Promise<CertificateStore> {
		const client = new MongoClient(uri);
		await client.connect();
		const db = client.db();
		const collection = db.collection("certificates");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		await collection.createIndex({ serviceId: 1 });
		await collection.createIndex({ expiresAt: 1 });
		return new CertificateStore(client, collection);
	}

	async disconnect(): Promise<void> {
		await this._client.close();
	}

	async save(cert: SignedCertificate): Promise<void> {
		await this._collection.insertOne(cert);
	}

	async add(cert: SignedCertificate): Promise<void> {
		await this.save(cert);
	}

	async getBySerial(serialNumber: string): Promise<SignedCertificate | null> {
		const doc = await this._collection.findOne({ serialNumber });
		return doc as unknown as SignedCertificate | null;
	}

	async getByServiceId(serviceId: string): Promise<SignedCertificate | null> {
		const doc = await this._collection.findOne(
			{ serviceId },
			{ sort: { issuedAt: -1 } }
		);
		return doc as unknown as SignedCertificate | null;
	}

	async getExpiring(marginMs: number): Promise<SignedCertificate[]> {
		const threshold = new Date(Date.now() + marginMs);
		const docs = await this._collection
			.find({ expiresAt: { $lte: threshold } })
			.toArray();
		return docs as unknown as SignedCertificate[];
	}
}
