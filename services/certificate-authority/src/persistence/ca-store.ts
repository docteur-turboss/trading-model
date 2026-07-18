import type { CaMetadata } from "@trading-model/certificate-utils/types";
import { MongoStoreBase } from "@trading-model/common/persistence/mongo-store-base";
import { MONGO_MANAGER } from "./mongo-manager";

export class CaStore extends MongoStoreBase<CaMetadata> {
	private constructor(collection: import("mongodb").Collection) {
		super(collection);
	}

	static async connect(_uri?: string): Promise<CaStore> {
		const db = await MONGO_MANAGER.getDb();
		const collection = db.collection("ca_store");
		return new CaStore(collection);
	}

	async getLatest(): Promise<CaMetadata | null> {
		const doc = await this._collection.findOne({}, { sort: { createdAt: -1 } });
		return doc as unknown as CaMetadata | null;
	}
}
