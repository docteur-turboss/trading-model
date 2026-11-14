import type { EventEnumMap } from "@trading-model/contracts/event-map";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import type { AuditEventDocument } from "./audit-repository";

const MS_PER_DAY = 86_400_000;

/** A message as message-manager delivers it: only the topic is guaranteed. */
export interface DeliveredEnvelope {
	metadata: {
		topic: string;
		eventType?: EventEnumMap;
		messageId?: string;
		correlationId?: string;
		emittedAt?: string;
		publisher?: { serviceName?: string; instanceId?: string };
	};
	payload?: unknown;
}

export function buildAuditDocument(
	{ metadata, payload }: DeliveredEnvelope,
	ttlDays: number
): AuditEventDocument {
	return {
		receivedAt: metadata.emittedAt ? new Date(metadata.emittedAt) : new Date(),
		ttl: new Date(Date.now() + ttlDays * MS_PER_DAY),
		dataHash: "",
		previousHash: "",
		chainSequence: 0,
		metadata: {
			topic: toTopic(metadata.topic),
			eventType:
				// as unknown as: topic string stands in for the event enum, as stored today
				metadata.eventType ?? (metadata.topic as unknown as EventEnumMap),
			publisher: toServiceId(metadata.publisher?.serviceName ?? "unknown"),
			instanceId: toInstanceId(metadata.publisher?.instanceId ?? "unknown"),
			messageId: toMessageId(metadata.messageId ?? "unknown"),
			correlationId: metadata.correlationId
				? toCorrelationId(metadata.correlationId)
				: undefined,
		},
		payload,
	};
}
