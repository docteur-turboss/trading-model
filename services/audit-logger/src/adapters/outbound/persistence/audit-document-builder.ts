import type { EventEnumMap } from "@trading-model/common/config/event.types";
import {
	type CorrelationId,
	type Topic,
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import type { ParsedEnvelope } from "../../../subscription/message-parser";
import type { AuditEventDocument } from "./audit-repository";

export function buildAuditDocument(parsed: ParsedEnvelope): AuditEventDocument {
	const { topic, payload, metadata } = parsed;
	return {
		receivedAt: resolveReceivedAt(metadata),
		metadata: buildAuditMetadata(topic, metadata),
		payload,
	};
}

function resolveReceivedAt(metadata: { emittedAt?: string }): Date {
	return metadata?.emittedAt ? new Date(metadata.emittedAt) : new Date();
}

function buildAuditMetadata(
	topic: Topic,
	metadata: {
		eventType?: EventEnumMap;
		publisher?: { serviceName?: string; instanceId?: string };
		messageId?: string;
		correlationId?: CorrelationId;
	}
): AuditEventDocument["metadata"] {
	const publisher = metadata?.publisher;
	return {
		topic: toTopic(topic),
		eventType: metadata?.eventType ?? (topic as unknown as EventEnumMap),
		publisher: toServiceId(publisher?.serviceName ?? "unknown"),
		instanceId: toInstanceId(publisher?.instanceId ?? "unknown"),
		messageId: toMessageId(metadata?.messageId ?? "unknown"),
		correlationId: metadata?.correlationId
			? toCorrelationId(metadata.correlationId)
			: undefined,
	};
}
