import { toServiceId, toTopic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";
import type {
	AuditEventDocument,
	AuditRepository,
} from "../persistence/audit-repository";

interface MessageMetadata {
	topic: string;
	eventType?: string;
	messageId?: string;
	correlationId?: string;
	causationId?: string;
	emittedAt?: string;
	schemaVersion?: string;
	publisher?: ServiceIdentity;
	routing?: {
		partitionKey?: string;
		priority?: number;
	};
	delivery?: {
		mode?: string;
		ttl?: number;
		deduplicationId?: string;
	};
}

interface INcomingEnvelope {
	message?: {
		metadata: MessageMetadata;
		payload: unknown;
	};
	context?: {
		deliveryAttempt: number;
		consumerGroup: string;
	};
	metadata?: MessageMetadata;
	payload?: unknown;
}

export function createMessageHandler(
	auditRepo: AuditRepository
): RequestHandler {
	const handler: RequestHandler = catchSync(async (req) => {
		const parsed = _parseEnvelope(req.body as INcomingEnvelope);
		if (!parsed) {
			return sendResponse({ error: "Invalid message format: no topic" }, 400);
		}

		const document = _buildAuditDocument(parsed);
		await auditRepo.insert(document);

		return sendResponse({ status: "recorded" }, 200);
	});

	return handler;
}

interface ParsedEnvelope {
	topic: string;
	payload: unknown;
	metadata: MessageMetadata;
}

function _parseEnvelope(body: INcomingEnvelope): ParsedEnvelope | null {
	if (body.message?.metadata?.topic) {
		return _extractFromMessage(body);
	}
	if (body.metadata?.topic) {
		return _extractFromRoot(body);
	}
	return null;
}

function _extractFromMessage(body: INcomingEnvelope): ParsedEnvelope {
	return {
		topic: body.message!.metadata.topic,
		payload: body.message!.payload,
		metadata: body.message!.metadata,
	};
}

function _extractFromRoot(body: INcomingEnvelope): ParsedEnvelope {
	return {
		topic: body.metadata!.topic,
		payload: body.payload,
		metadata: body.metadata!,
	};
}

function _buildAuditDocument(parsed: ParsedEnvelope): AuditEventDocument {
	const { topic, payload, metadata } = parsed;
	return {
		receivedAt: _resolveReceivedAt(metadata),
		metadata: _buildAuditMetadata(topic, metadata),
		payload,
	};
}

function _resolveReceivedAt(metadata: MessageMetadata): Date {
	return metadata?.emittedAt ? new Date(metadata.emittedAt) : new Date();
}

function _buildAuditMetadata(
	topic: string,
	metadata: MessageMetadata
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
