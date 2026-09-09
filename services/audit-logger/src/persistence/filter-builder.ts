import type { Filter } from "mongodb";
import {
	type AuditEventDocument,
	type AuditEventQuery,
	METADATA_FIELDS,
} from "../adapters/outbound/persistence/audit-repository";
import { buildDateRangeFilter } from "./date-range-filter";

export function buildAuditEventFilter(
	query: AuditEventQuery
): Filter<AuditEventDocument> {
	const filter: Filter<AuditEventDocument> = {};

	if (query.topic) {
		filter[METADATA_FIELDS.topic] = query.topic;
	}
	if (query.publisher) {
		filter[METADATA_FIELDS.publisher] = query.publisher;
	}
	if (query.correlationId) {
		filter[METADATA_FIELDS.correlationId] = query.correlationId;
	}
	if (query.dateRange) {
		filter.receivedAt = buildDateRangeFilter(query.dateRange);
	}

	return filter;
}
