import type { Filter } from "mongodb";
import type { AuditEventDocument, AuditEventQuery } from "./audit-repository";

export class FilterBuilder {
	build(query: AuditEventQuery): Filter<AuditEventDocument> {
		const filter: Filter<AuditEventDocument> = {};

		if (query.topic) {
			filter["metadata.topic"] = query.topic;
		}
		if (query.publisher) {
			filter["metadata.publisher"] = query.publisher;
		}
		if (query.correlationId) {
			filter["metadata.correlationId"] = query.correlationId;
		}
		if (query.dateRange) {
			const rangeFilter: { $gte?: Date; $lte?: Date } = {};
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
