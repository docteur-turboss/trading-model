import type { Filter } from "mongodb";
import type { AuditEventDocument, AuditEventQuery } from "./audit-repository";

const METADATA_FIELDS = {
	topic: "metadata.topic" as const,
	publisher: "metadata.publisher" as const,
	correlationId: "metadata.correlationId" as const,
} as const;

export class FilterBuilder {
	build(query: AuditEventQuery): Filter<AuditEventDocument> {
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
}
