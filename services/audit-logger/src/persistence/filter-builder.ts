import type { Filter } from "mongodb";
import {
	type AuditEventDocument,
	type AuditEventQuery,
	METADATA_FIELDS,
} from "./audit-repository";

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
		const rangeFilter: Record<string, Date | undefined> = {};
		if (query.dateRange.start) {
			rangeFilter.$gte = query.dateRange.start;
		}
		if (query.dateRange.end) {
			rangeFilter.$lte = query.dateRange.end;
		}
		filter.receivedAt = rangeFilter;
	}

	return filter;
}
