import { ENV } from "../config/env";
import { getCollection } from "../config/db";
import { DlqQueryBuilder } from "./dlq-query-builder";

export class DlqQueueRepository {
	private readonly _queryBuilder: DlqQueryBuilder;

	constructor(queryBuilder?: DlqQueryBuilder) {
		this._queryBuilder = queryBuilder ?? new DlqQueryBuilder();
	}

	async listQueuable(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildQueuableQuery();
		const docs = await col
			.find(query, {
				sort: { createdAt: -1 },
				limit: ENV.DLQ_AUTO_RETRY_LIMIT * 10,
				projection: { _id: 1 },
			})
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}

	async listActiveClaimIds(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildActiveClaimQuery();
		const docs = await col.find(query, { projection: { _id: 1 } }).toArray();
		return docs.map((doc) => doc._id.toHexString());
	}
}
