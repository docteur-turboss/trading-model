import type { Collection, Db } from "mongodb";
import type { ServiceLogDocument } from "./log-repository";

export class LogIndexManager {
	private _indexesEnsured = false;
	private readonly _collection: Collection<ServiceLogDocument>;

	constructor(db: Db) {
		this._collection =
			db.collection<ServiceLogDocument>("service_logs");
	}

	async ensure(): Promise<void> {
		if (this._indexesEnsured) return;
		this._indexesEnsured = true;

		await this._collection.createIndex(
			{ ttl: 1 },
			{ expireAfterSeconds: 0 }
		);
		await this._collection.createIndex(
			{ "service.name": 1, receivedAt: -1 }
		);
		await this._collection.createIndex({ level: 1, receivedAt: -1 });
		await this._collection.createIndex({ correlationId: 1 });
		await this._collection.createIndex({ receivedAt: -1 });
	}
}
