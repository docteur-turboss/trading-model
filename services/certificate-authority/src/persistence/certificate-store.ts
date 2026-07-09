import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import type { SerialNumber } from "@trading-model/common/domain/primitives";
import type { Collection } from "mongodb";
import { MONGO_MANAGER } from "./mongo-manager";

export class CertificateStore {
	private readonly _collection: Collection;

	private constructor(collection: Collection) {
		this._collection = collection;
	}

	static async connect(_uri?: string): Promise<CertificateStore> {
		const db = MONGO_MANAGER.getDb();
		const collection = db.collection("certificates");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		await collection.createIndex({ serviceId: 1 });
		await collection.createIndex({ expiresAt: 1 });
		return new CertificateStore(collection);
	}

	/** Connection lifecycle is managed externally by MONGO_MANAGER. */
	async disconnect(): Promise<void> {}

	async insert(cert: SignedCertificate): Promise<void> {
		await this._collection.insertOne(cert);
	}

	async getBySerial(
		serialNumber: SerialNumber
	): Promise<SignedCertificate | null> {
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
