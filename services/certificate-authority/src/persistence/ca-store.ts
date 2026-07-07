import type { CaMetadata } from "@trading-model/certificate-utils/types";
import type { Collection } from "mongodb";
import { MONGO_MANAGER } from "./mongo-manager";

export class CaStore {
	private readonly _collection: Collection;

	private constructor(collection: Collection) {
		this._collection = collection;
	}

	static async connect(_uri?: string): Promise<CaStore> {
		const db = MONGO_MANAGER.getDb();
		const collection = db.collection("ca_store");
		return new CaStore(collection);
	}

	/** Connection lifecycle is managed externally by MONGO_MANAGER. */
	async disconnect(): Promise<void> {}

	async save(metadata: CaMetadata): Promise<void> {
		await this._collection.insertOne(metadata);
	}

	async getLatest(): Promise<CaMetadata | null> {
		const doc = await this._collection.findOne({}, { sort: { createdAt: -1 } });
		return doc as unknown as CaMetadata | null;
	}
}
