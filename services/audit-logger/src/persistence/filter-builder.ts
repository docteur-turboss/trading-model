import type { Filter } from "mongodb";
import {
	type AuditEventDocument,
	type AuditEventQuery,
	METADATA_FIELDS,
} from "./audit-repository";
import { MongoFilterBuilder } from "./mongo-filter-builder";

export class FilterBuilder extends MongoFilterBuilder<AuditEventQuery> {
	build(query: AuditEventQuery): Filter<AuditEventDocument> {
		const filter: Filter<AuditEventDocument> = {};

		this._addIfPresent(filter, METADATA_FIELDS.topic, query.topic);
		this._addIfPresent(filter, METADATA_FIELDS.publisher, query.publisher);
		this._addIfPresent(
			filter,
			METADATA_FIELDS.correlationId,
			query.correlationId
		);
		this._addDateRangeFilter(filter, query.dateRange, "receivedAt");

		return filter;
	}
}
