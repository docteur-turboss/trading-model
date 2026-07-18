import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import type {
	SerialNumber,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { MongoStoreBase } from "@trading-model/common/persistence/mongo-store-base";
import { MONGO_MANAGER } from "./mongo-manager";

export class CertificateStore extends MongoStoreBase<SignedCertificate> {
	private constructor(collection: import("mongodb").Collection) {
		super(collection);
	}

	static async connect(_uri?: string): Promise<CertificateStore> {
		const db = await MONGO_MANAGER.getDb();
		const collection = db.collection("certificates");
		await collection.createIndex({ serialNumber: 1 }, { unique: true });
		await collection.createIndex({ serviceId: 1 });
		await collection.createIndex({ expiresAt: 1 });
		return new CertificateStore(collection);
	}

	async getBySerial(
		serialNumber: SerialNumber
	): Promise<SignedCertificate | null> {
		const doc = await this._collection.findOne({ serialNumber });
		return doc as unknown as SignedCertificate | null;
	}

	async getByServiceId(
		serviceId: ServiceId
	): Promise<SignedCertificate | null> {
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
