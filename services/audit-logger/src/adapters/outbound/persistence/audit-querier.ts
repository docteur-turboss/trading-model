import { Limit } from "@trading-model/primitives/primitives/page-number";
import type { Collection } from "mongodb";

import {
	type AuditEventDocument,
	type AuditEventQuery,
	buildAuditEventFilter,
} from "./filter-builder";

/**
 * A page, newest first. `nextCursor` is the `chainSequence` to send back as
 * `before` for the next page (null on the last one); `total` only when asked for.
 */
export interface AuditPage {
	docs: AuditEventDocument[];
	total?: number;
	nextCursor: number | null;
	limit: number;
}

export class AuditQuerier {
	constructor(private readonly _collection: Collection<AuditEventDocument>) {}

	async query(query: AuditEventQuery): Promise<AuditPage> {
		const limit = Limit.of(query.limit ?? 100, 1000);
		const filter = buildAuditEventFilter(query);
		// Keyset on the unique `chainSequence` index: the cost of a page does not grow with the trail.
		const pageFilter =
			query.before === undefined
				? filter
				: { ...filter, chainSequence: { $lt: query.before } };

		const [docs, total] = await Promise.all([
			this._collection
				.find(pageFilter)
				.sort({ chainSequence: -1 })
				.limit(limit)
				.toArray(),
			// Opt-in: countDocuments is O(n) on a broad filter.
			// No filter: the collection counter, not a scan (estimate, exact once TTL settles).
			query.withTotal === true
				? Object.keys(filter).length === 0
					? this._collection.estimatedDocumentCount()
					: this._collection.countDocuments(filter)
				: undefined,
		]);

		return {
			docs,
			...(total === undefined ? {} : { total }),
			nextCursor:
				docs.length === limit ? docs[docs.length - 1].chainSequence : null,
			limit,
		};
	}

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return await this._collection.findOne({ "metadata.messageId": messageId });
	}
}
