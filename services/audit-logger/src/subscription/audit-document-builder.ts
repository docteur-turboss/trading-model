import { toServiceId, toTopic } from "@trading-model/common/domain/primitives";
import type { AuditEventDocument } from "../persistence/audit-repository";
import type { ParsedEnvelope } from "./message-parser";

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
	topic: string,
	metadata: {
		eventType?: string;
		publisher?: { serviceName?: string; instanceId?: string };
		messageId?: string;
		correlationId?: string;
	}
): AuditEventDocument["metadata"] {
	const publisher = metadata?.publisher;
	return {
		topic: toTopic(topic),
		eventType: metadata?.eventType ?? topic,
		publisher: toServiceId(publisher?.serviceName ?? "unknown"),
		instanceId: publisher?.instanceId ?? "unknown",
		messageId: metadata?.messageId ?? "unknown",
		correlationId: metadata?.correlationId,
	};
}
