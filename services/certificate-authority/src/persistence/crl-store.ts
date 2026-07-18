import type { RevokedCertificate } from "@trading-model/certificate-utils/keygen/types";
import type { SerialNumber } from "@trading-model/common/domain/primitives";
import { MongoStoreBase } from "@trading-model/common/persistence/mongo-store-base";
import { MONGO_MANAGER } from "./mongo-manager";

export class CrlStore extends MongoStoreBase<RevokedCertificate> {
	private constructor(collection: import("mongodb").Collection) {
		// biome-ignore lint/suspicious/noExplicitAny: MongoStoreBase expects Collection<unknown>, incoming is unparameterized
		super(collection as any);
	}

	static async connect(_uri?: string): Promise<CrlStore> {
		const db = await MONGO_MANAGER.getDb();
		const collection = db.collection("crl");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		return new CrlStore(collection);
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
