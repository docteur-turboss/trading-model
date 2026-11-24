import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type { QueryEnvelope } from "@trading-model/primitives/pagination";
import type {
	CorrelationId,
	InstanceId,
	MessageId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import type { Filter } from "mongodb";

export interface AuditEventDocument {
	receivedAt: Date;
	ttl: Date;
	dataHash: string;
	previousHash: string;
	chainSequence: number;
	metadata: {
		topic: Topic;
		eventType: EventEnumMap | string;
		publisher: ServiceId;
		instanceId: InstanceId;
		messageId: MessageId;
		correlationId?: CorrelationId;
	};
	payload: unknown;
}

export const METADATA_FIELDS = {
	topic: "metadata.topic",
	publisher: "metadata.publisher",
	correlationId: "metadata.correlationId",
	messageId: "metadata.messageId",
} as const;

/** Filters of `GET /events`; an absent field does not filter. */
interface AuditFilter {
	topic?: Topic;
	publisher?: ServiceId;
	correlationId?: CorrelationId;
}

export interface AuditEventQuery extends QueryEnvelope, AuditFilter {
	/** `false` skips the count (`total` absent); default: counted. */
	withTotal?: boolean;
}

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
		const { start, end } = query.dateRange;
		filter.receivedAt = {
			...(start ? { $gte: start } : {}),
			...(end ? { $lte: end } : {}),
		};
	}

	return filter;
}
