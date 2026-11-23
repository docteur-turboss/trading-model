import type { EventEnumMap } from "@trading-model/contracts/event-map";
import {
	CorrelationId,
	InstanceId,
	MessageId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { MS_PER_DAY } from "../../../domain/audit-chain";
import type { AuditEventDocument } from "./audit-repository";

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
			topic: Topic.of(metadata.topic),
			eventType:
				// as unknown as: topic string stands in for the event enum, as stored today
				metadata.eventType ?? (metadata.topic as unknown as EventEnumMap),
			publisher: ServiceId.of(metadata.publisher?.serviceName ?? "unknown"),
			instanceId: InstanceId.of(metadata.publisher?.instanceId ?? "unknown"),
			messageId: MessageId.of(metadata.messageId ?? "unknown"),
			correlationId: metadata.correlationId
				? CorrelationId.of(metadata.correlationId)
				: undefined,
		},
		payload,
	};
}
