import { z } from 'zod';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';
import { normalizeError } from '@trading-model/common/utils/errors';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { logsIngestedTotal, logsStoredTotal } from '../config/metrics';
import { LogRepository, ServiceLogDocument } from '../persistence/log-repository';

const LogEntrySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
  serviceName: z.string().optional(),
  instanceId: z.string().optional(),
  module: z.string().optional(),
  correlationId: z.string().optional(),
  environment: z.string().optional(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  error: z
    .object({
      name: z.string().optional(),
      message: z.string().optional(),
      stack: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
  request: z
    .object({
      method: z.string().optional(),
      url: z.string().optional(),
      statusCode: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

const LogsBatchSchema = z.object({
  logs: z.array(LogEntrySchema).min(1).max(1000),
});

export function createLogHandler(logRepo: LogRepository) {
  return catchSync(async req => {
    const parsed = LogsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendResponse({ error: parsed.error.message }, 400);
    }

    const docs: ServiceLogDocument[] = [];
    const receivedAt = new Date();
    const ttlDays = env.LOG_RETENTION_DAYS ?? 1827;

    for (const entry of parsed.data.logs) {
      const context = entry.context ?? {};
      const errorObj =
        entry.error ??
        (context.err || context.error
          ? {
              name: (context.err as Error)?.name ?? (context.error as Error)?.name,
              message: (context.err as Error)?.message ?? (context.error as Error)?.message,
              stack: (context.err as Error)?.stack ?? (context.error as Error)?.stack,
            }
          : undefined);

      const doc: ServiceLogDocument = {
        receivedAt,
        ttl: new Date(Date.now() + ttlDays * 86400_000),
        level: entry.level,
        message: entry.message,
        service: {
          name: entry.serviceName ?? 'unknown',
          instanceId: entry.instanceId ?? 'unknown',
        },
        module: entry.module,
        correlationId: entry.correlationId,
        context:
          Object.keys(context).length > 0 && !context.err && !context.error ? context : undefined,
        error: errorObj,
        environment: entry.environment,
      };

      if (entry.request) {
        doc.request = entry.request;
      }
      if (entry.userId || entry.sessionId) {
        doc.user = {
          id: entry.userId ?? undefined,
          sessionId: entry.sessionId ?? undefined,
        };
      }

      logsIngestedTotal.inc({ level: entry.level, service_name: entry.serviceName ?? 'unknown' });
      docs.push(doc);
    }

    try {
      await logRepo.insertBatch(docs);
      logsStoredTotal.inc({ status: 'success' }, docs.length);
      return sendResponse({ stored: docs.length }, 200);
    } catch (err) {
      logger.error('Failed to store service logs', { error: normalizeError(err) });
      logsStoredTotal.inc({ status: 'error' }, docs.length);
      return sendResponse({ error: 'Storage unavailable' }, 503);
    }
  });
}
