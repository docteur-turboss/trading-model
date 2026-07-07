interface MessageMetadata {
	topic: string;
	eventType?: string;
	messageId?: string;
	correlationId?: string;
	causationId?: string;
	emittedAt?: string;
	schemaVersion?: string;
	publisher?: { serviceName?: string; instanceId?: string };
	routing?: { partitionKey?: string; priority?: number };
	delivery?: { mode?: string; ttl?: number; deduplicationId?: string };
}

interface INcomingEnvelope {
	message?: { metadata: MessageMetadata; payload: unknown };
	context?: { deliveryAttempt: number; consumerGroup: string };
	metadata?: MessageMetadata;
	payload?: unknown;
}

export interface ParsedEnvelope {
	topic: string;
	payload: unknown;
	metadata: MessageMetadata;
}

export function parseEnvelope(body: INcomingEnvelope): ParsedEnvelope | null {
	if (body.message?.metadata?.topic) {
		return extractFromMessage(body);
	}
	if (body.metadata?.topic) {
		return extractFromRoot(body);
	}
	return null;
}

function extractFromMessage(body: INcomingEnvelope): ParsedEnvelope {
	return {
		topic: body.message!.metadata.topic,
		payload: body.message!.payload,
		metadata: body.message!.metadata,
	};
}

function extractFromRoot(body: INcomingEnvelope): ParsedEnvelope {
	return {
		topic: body.metadata!.topic,
		payload: body.payload,
		metadata: body.metadata!,
	};
}
