import { createHash } from "node:crypto";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import {
	type CorrelationId,
	type Topic,
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import type { ParsedEnvelope } from "../../inbound/subscription/message-parser";
import type { AuditEventDocument } from "./audit-repository";

const MS_PER_DAY = 86_400_000;

export function buildAuditDocument(
	parsed: ParsedEnvelope,
	ttlDays: number
): AuditEventDocument {
	const { topic, payload, metadata } = parsed;
	const receivedAt = resolveReceivedAt(metadata);
	const auditMetadata = buildAuditMetadata(topic, metadata);
	return {
		receivedAt,
		ttl: new Date(Date.now() + ttlDays * MS_PER_DAY),
		dataHash: "",
		previousHash: "",
		chainSequence: 0,
		metadata: auditMetadata,
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

export function computeAuditHash(data: {
	receivedAt: Date;
	metadata: AuditEventDocument["metadata"];
	payload: unknown;
	previousHash: string;
	chainSequence: number;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify(data, (_key, value) =>
				typeof value === "bigint" ? value.toString() : value
			)
		)
		.digest("hex");
}
