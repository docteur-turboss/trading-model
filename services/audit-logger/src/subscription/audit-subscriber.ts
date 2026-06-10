import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { AuditRepository, AuditEventDocument } from '../persistence/audit-repository';

interface MessageMetadata {
  topic: string;
  eventType?: string;
  messageId?: string;
  correlationId?: string;
  causationId?: string;
  emittedAt?: string;
  schemaVersion?: string;
  publisher?: {
    serviceName: string;
    instanceId: string;
  };
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

interface IncomingEnvelope {
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

export function createMessageHandler(auditRepo: AuditRepository): RequestHandler {
  const handler: RequestHandler = catchSync(async req => {
    const body = req.body as IncomingEnvelope;

    let topic: string | undefined;
    let payload: unknown;
    let metadata: MessageMetadata | undefined;

    if (body.message?.metadata?.topic) {
      topic = body.message.metadata.topic;
      payload = body.message.payload;
      metadata = body.message.metadata;
    } else if (body.metadata?.topic) {
      topic = body.metadata.topic;
      payload = body.payload;
      metadata = body.metadata;
    }

    if (!topic) {
      return sendResponse({ error: 'Invalid message format: no topic' }, 400);
    }

    const publisher = metadata?.publisher;

    const document: AuditEventDocument = {
      receivedAt: metadata?.emittedAt ? new Date(metadata.emittedAt) : new Date(),
      metadata: {
        topic,
        eventType: metadata?.eventType ?? topic,
        publisher: publisher?.serviceName ?? 'unknown',
        instanceId: publisher?.instanceId ?? 'unknown',
        messageId: metadata?.messageId ?? 'unknown',
        correlationId: metadata?.correlationId,
      },
      payload,
    };

    await auditRepo.insert(document);

    return sendResponse({ status: 'recorded' }, 200);
  });

  return handler;
}
