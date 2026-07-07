import type { RevokedCertificate } from "@trading-model/certificate-utils/types";
import type { SerialNumber } from "@trading-model/common/domain/primitives";
import type { Collection } from "mongodb";
import { MONGO_MANAGER } from "./mongo-manager";

export class CrlStore {
	private readonly _collection: Collection;

	private constructor(collection: Collection) {
		this._collection = collection;
	}

	static async connect(_uri?: string): Promise<CrlStore> {
		const db = MONGO_MANAGER.getDb();
		const collection = db.collection("crl");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		return new CrlStore(collection);
	}

	/** Connection lifecycle is managed externally by MONGO_MANAGER. */
	async disconnect(): Promise<void> {}

	async save(entry: RevokedCertificate): Promise<void> {
		await this._collection.insertOne(entry);
	}

	async getAll(): Promise<RevokedCertificate[]> {
		const docs = await this._collection.find().toArray();
		return docs as unknown as RevokedCertificate[];
	}

	async isRevoked(serialNumber: SerialNumber): Promise<boolean> {
		const entry = await this._collection.findOne({ serialNumber });
		return entry !== null;
	}
}
