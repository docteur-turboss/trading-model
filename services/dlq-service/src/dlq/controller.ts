import { randomUUID } from 'node:crypto';

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { HttpClient } from '@trading-model/common/config/http-client';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';
import { normalizeError } from '@trading-model/common/utils/errors';

import { dlqRepository, DlqCapacityError } from './repository';
import { findAService } from '../config/address-manager';
import { notifyAudit } from '../config/audit';
import { isDbConnected, getMissingCriticalIndexes } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { metrics } from '../config/metrics';
import { dlqRedisQueue } from '../config/redis-queue';

const tracer = trace.getTracer('dlq-service');

const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

const DlqEntrySchema = z.object({
  topic: z.string().optional(),
  message: z.unknown(),
  reason: z.string().optional(),
  deliveryAttempt: z.number().int(),
  timestamp: z.string(),
  messageId: z.string().optional(),
});

const DeleteSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
});

const ReplaySchema = z.object({
  topic: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  batchId: z.string().optional(),
});

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
let autoRetryStartTimer: ReturnType<typeof setTimeout> | null = null;
let redisRetryTimer: ReturnType<typeof setTimeout> | null = null;
export class ActiveReplayCounter {
  private _count = 0;
  get count(): number { return this._count; }
  increment(): void { this._count++; }
  decrement(): void { if (this._count > 0) this._count--; }
}
export const activeReplays = new ActiveReplayCounter();
let activeBatches = 0;
const MAX_CONCURRENT_BATCHES = 2;
let shuttingDown = false;

async function getHttpClient(): Promise<HttpClient> {
  if (httpClient) return httpClient;
  if (httpClientPromise) return httpClientPromise;

  httpClientPromise = (async () => {
    const client = new HttpClient({
      ca: env.TLS_CA_PATH,
      cert: env.TLS_CERT_PATH,
      key: env.TLS_KEY_PATH,
    });
    httpClient = client;
    return client;
  })();

  return httpClientPromise;
}

export async function reloadHttpClientTls(): Promise<void> {
  const client = httpClient as { reloadTlsPaths?: () => Promise<void> } | null;
  if (client && typeof client.reloadTlsPaths === 'function') {
    try {
      await client.reloadTlsPaths();
      logger.info('HTTP client TLS certificates reloaded');
    } catch (err) {
      logger.error('Failed to reload HTTP client TLS certificates', { error: (err as Error).message });
    }
  }
}

export async function closeHttpClient(): Promise<void> {
  httpClient = null;
  httpClientPromise = null;
}

async function resolveMessageManagerUrl(): Promise<string | null> {
  let url: string | null = env.MESSAGE_MANAGER_URL ?? null;
  if (!url) {
    try {
      const target = await findAService(ServiceInstanceName.MessageDeliveryService);
      if (target) {
        url = `https://${target.ip}:${target.port}`;
      }
    } catch {
      logger.warn('DLQ address-manager resolution failed');
    }
  }
  return url;
}

let mmCircuitFailures = 0;
let mmCircuitOpenUntil = 0;
let mmHalfOpenAttempts = 0;
const MM_CIRCUIT_THRESHOLD = 5;
const MM_CIRCUIT_RESET_MS = 30_000;
const MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 2;

function isMMCircuitOpen(): boolean {
  if (mmCircuitOpenUntil > Date.now()) return true;
  if (mmCircuitOpenUntil > 0) {
    mmCircuitFailures = 0;
    mmCircuitOpenUntil = 0;
    mmHalfOpenAttempts = 0;
  }
  return false;
}

function recordMMResult(success: boolean): void {
  if (success) {
    if (mmCircuitFailures > 0) mmCircuitFailures = 0;
    mmCircuitOpenUntil = 0;
    mmHalfOpenAttempts = 0;
  } else {
    mmCircuitFailures++;
    if (mmCircuitOpenUntil > 0) {
      mmHalfOpenAttempts++;
      if (mmHalfOpenAttempts >= MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS) {
        mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
        logger.warn('Message-manager circuit breaker re-opened during half-open', { failures: mmCircuitFailures, halfOpenAttempts: mmHalfOpenAttempts, resetMs: MM_CIRCUIT_RESET_MS });
      }
    }
    if (mmCircuitFailures >= MM_CIRCUIT_THRESHOLD) {
      mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
      logger.warn('Message-manager circuit breaker opened', { failures: mmCircuitFailures, resetMs: MM_CIRCUIT_RESET_MS });
    }
  }
}

async function doReplayBatch(entries: Array<{ id: string; message: unknown }>, messageManagerUrl: string, batchId: string, instanceId: string): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
  if (activeBatches >= MAX_CONCURRENT_BATCHES) {
    logger.warn('Too many concurrent replay batches — rejecting', { batchId, entryCount: entries.length, activeBatches });
    const errors = entries.map(e => ({ id: e.id, error: 'Too many concurrent replay batches' }));
    return { success: 0, errors };
  }
  activeBatches++;
  try {
    const client = await getHttpClient();
    const REPLAY_CONCURRENCY = 10;
    const REPLAY_TIMEOUT_MS = 10_000;

    if (isMMCircuitOpen() && entries.length > 0) {
      logger.warn('Message-manager circuit breaker open — rejecting replay batch', { batchId, entryCount: entries.length });
      const errors = entries.map(e => ({ id: e.id, error: 'Message-manager circuit breaker open' }));
      return { success: 0, errors };
    }

    const REPLAY_BATCH_TIMEOUT_MS = 120_000;
    let batchTimedOut = false;
    let successCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    const batchLoop = (async () => {
      for (let i = 0; i < entries.length && !batchTimedOut; i += REPLAY_CONCURRENCY) {
        const batch = entries.slice(i, i + REPLAY_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(entry =>
            (async () => {
              let delivered = false;
              try {
              activeReplays.increment();
              if (shuttingDown) throw new Error('Server shutting down');
                await client.post(
                  `${messageManagerUrl}/message`,
                  entry.message,
                  {
                    timeoutMs: REPLAY_TIMEOUT_MS,
                    serviceName: ServiceInstanceName.MessageDeliveryService,
                    retryCount: 3,
                  }
                );
                delivered = true;
                await dlqRepository.markRetried(entry.id, instanceId, batchId, true);
              } catch (err) {
                if (batchTimedOut) throw err;
                if (delivered) {
                  logger.warn('Message delivered but failed to mark as completed — releasing claim', { entryId: entry.id, error: (err as Error).message });
                  await dlqRepository.releaseClaimWithoutCount(entry.id).catch(e => {
                    logger.error('CRITICAL: Failed to release claim after successful delivery', { entryId: entry.id, error: (e as Error).message });
                  });
                  return;
                } else {
                  const httpError = (err as Error).message;
                  try {
                    await dlqRepository.markRetried(entry.id, instanceId, batchId, false, httpError);
                  } catch (markErr) {
                    logger.error('Failed to mark entry as failed — releasing claim without count', { entryId: entry.id, error: (markErr as Error).message });
                    await dlqRepository.incrementRetryCount(entry.id).catch(e => {
                      logger.error('CRITICAL: Failed to increment retryCount after markRetried failure', { entryId: entry.id, error: (e as Error).message });
                    });
                    await dlqRepository.releaseClaimWithoutCount(entry.id).catch(e => {
                      logger.error('CRITICAL: Failed to release claim after error', { entryId: entry.id, error: (e as Error).message });
                    });
                  }
                }
                throw err;
              } finally {
                activeReplays.decrement();
              }
            })()
          )
        );

        for (let idx = 0; idx < batchResults.length; idx++) {
          const result = batchResults[idx];
          const entry = batch[idx];
          if (result.status === 'fulfilled') {
            successCount++;
            hasSuccess = true;
          } else {
            hasFailure = true;
            errors.push({ id: entry?.id ?? 'unknown', error: (result.reason as Error)?.message ?? 'unknown error' });
            logger.error('DLQ replay entry failed', {
              entryId: entry?.id,
              error: (result.reason as Error)?.message,
              batchId,
            });
          }
        }
      }
    })();

    let timeoutHandle: ReturnType<typeof setTimeout> = undefined as unknown as ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(() => {
        batchTimedOut = true;
        logger.warn('DLQ batch replay timeout — stopping new requests, waiting for in-flight', { batchId });
        resolve();
      }, REPLAY_BATCH_TIMEOUT_MS);
    });

    await Promise.race([batchLoop, timeoutPromise]);
    clearTimeout(timeoutHandle);

    if (batchTimedOut) {
      try {
        await batchLoop;
      } catch {
        // batchLoop errors are handled internally
      }
    }

    recordMMResult(successCount > 0);
    return { success: successCount, errors };
  } finally {
    activeBatches--;
  }
}

async function notifyAddAudit(id: string, topic: string | undefined, reason: string | undefined): Promise<void> {
  notifyAudit({
    timestamp: new Date().toISOString(),
    topic: topic ?? 'unknown',
    publisher: 'dlq-service',
    correlationId: id,
    summary: `DLQ entry added: ${reason ?? 'no reason'}`,
    severity: 'WARNING',
  }).catch(() => {});
}

async function notifyReplayAudit(batchId: string, topic: string | undefined, success: number, failed: number): Promise<void> {
  if (success === 0 && failed === 0) return;
  notifyAudit({
    timestamp: new Date().toISOString(),
    topic: topic ?? 'unknown',
    publisher: 'dlq-service',
    correlationId: batchId,
    summary: `DLQ replay: ${success} succeeded, ${failed} failed`,
    severity: failed > 0 ? 'ERROR' : 'INFO',
  }).catch(() => {});
}

async function notifyAbandonAudit(count: number): Promise<void> {
  if (count === 0) return;
  notifyAudit({
    timestamp: new Date().toISOString(),
    topic: 'dlq-service',
    publisher: 'dlq-service',
    correlationId: 'abandon',
    summary: `${count} DLQ entries abandoned after max retries`,
    severity: 'CRITICAL',
  }).catch(() => {});
}

async function notifyDeleteAudit(ids: string[], deleted: number): Promise<void> {
  if (deleted === 0) return;
  notifyAudit({
    timestamp: new Date().toISOString(),
    topic: 'dlq-service',
    publisher: 'dlq-service',
    correlationId: ids[0],
    summary: `${deleted} DLQ entries deleted`,
    severity: 'INFO',
  }).catch(() => {});
}

export const AddEntry = catchSync(async req => {
  return tracer.startActiveSpan('dlq-add-entry', async span => {
    try {
      const parsed = DlqEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: parsed.error.message });
        span.end();
        return sendResponse({ error: parsed.error.message }, 400);
      }

      span.setAttribute('topic', parsed.data.topic);
      span.setAttribute('reason', parsed.data.reason);

      const messageStr = JSON.stringify(parsed.data.message);
      const msgSize = Buffer.byteLength(messageStr, 'utf8');
      if (msgSize > MAX_MESSAGE_BYTES) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Message exceeds 5MB' });
        span.end();
        return sendResponse({ error: 'Message payload exceeds maximum size of 5MB' }, 400);
      }

      if (!isDbConnected()) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Storage unavailable' });
        span.end();
        return sendResponse({ error: 'Storage unavailable — message not persisted. Retry later.', code: 'STORAGE_UNAVAILABLE' }, 503);
      }

      const id = await dlqRepository.add(parsed.data);
      span.setAttribute('entryId', id);
      metrics.entriesAdded.inc(1);
      try {
        await Promise.race([
          dlqRedisQueue.push(id),
          new Promise<void>((_, reject) => {
            const t = setTimeout(() => reject(new Error('Redis push timeout')), 2000);
            t.unref();
          }),
        ]);
      } catch (err) {
        logger.warn('Failed to push entry to Redis queue', { entryId: id, error: (err as Error)?.message });
      }
      notifyAddAudit(id, parsed.data.topic, parsed.data.reason);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return sendResponse({ id }, 201);
    } catch (err) {
      if (err instanceof DlqCapacityError) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'DLQ capacity limit reached' });
        span.end();
        return sendResponse({ error: 'DLQ capacity limit reached, entry rejected' }, 429);
      }
      logger.error('Failed to persist DLQ entry — storage error', { error: normalizeError(err).message });
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.end();
      return sendResponse({ error: 'Storage unavailable — message not persisted. Retry later.', code: 'STORAGE_UNAVAILABLE' }, 503);
    }
  });
});

export const ListEntries = catchSync(async req => {
  const topic = req.query.topic as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 1000);
  const offset = !cursor ? Math.max(parseInt(req.query.offset as string, 10) || 0, 0) : 0;

  const entries = await dlqRepository.list(topic, limit, offset, cursor);
  const hasMore = entries.length === limit;
  const response: Record<string, unknown> = { entries, count: entries.length, hasMore };
  if (!cursor) response.offset = offset;
  if (hasMore && entries.length > 0) response.cursor = entries[entries.length - 1].id;
  return sendResponse(response, 200);
});

export const DeleteEntries = catchSync(async req => {
  const parsed = DeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendResponse({ error: parsed.error.message }, 400);
  }

  const deleted = await dlqRepository.delete(parsed.data.ids);
  metrics.entriesDeleted.inc(deleted);
  notifyDeleteAudit(parsed.data.ids, deleted);
  return sendResponse({ deleted }, 200);
});

export const HealthCheck = catchSync(async _req => {
  const count = await dlqRepository.count();
  return sendResponse({ status: 'ok', entries: count }, 200);
});

export const ReadyCheck = catchSync(async _req => {
  const dbOk = isDbConnected();
  if (!dbOk) {
    return sendResponse({ status: 'not ready', reason: 'Database not connected' }, 503);
  }
  const missingIndexes = getMissingCriticalIndexes();
  if (missingIndexes.length > 0) {
    return sendResponse({ status: 'degraded', reason: `Missing critical indexes: ${missingIndexes.join(', ')}` }, 503);
  }
  const redisOk = dlqRedisQueue.isAvailable();
  const status = redisOk ? 'ready' : 'degraded';
  const count = await dlqRepository.count();
  return sendResponse({ status, entries: count, redis: redisOk ? 'connected' : 'unavailable' }, 200);
});

export const ReplayEntries = catchSync(async req => {
  return tracer.startActiveSpan('dlq-replay-entries', async span => {
    try {
      const parsed = ReplaySchema.safeParse(req.query);
      if (!parsed.success) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: parsed.error.message });
        span.end();
        return sendResponse({ error: parsed.error.message }, 400);
      }

      span.setAttribute('topic', parsed.data.topic ?? 'all');
      span.setAttribute('limit', parsed.data.limit);

      const messageManagerUrl = await resolveMessageManagerUrl();
      if (!messageManagerUrl) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Cannot resolve message-manager URL' });
        span.end();
        return sendResponse({ error: 'Cannot resolve message-manager URL (no env var, no address-manager)' }, 500);
      }

      const batchId = parsed.data.batchId || randomUUID();
      span.setAttribute('batchId', batchId);
      await dlqRepository.releaseStaleClaims();
      const entries = await dlqRepository.claimEntriesForRetry(parsed.data.limit, batchId, env.INSTANCE_ID, parsed.data.topic);
      if (entries.length === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return sendResponse({ replayed: 0, message: 'No entries available for retry' }, 200);
      }

      span.setAttribute('entriesClaimed', entries.length);

      const { success: successCount, errors } = await doReplayBatch(
        entries.map(e => ({ id: e.id, message: e.message })),
        messageManagerUrl,
        batchId,
        env.INSTANCE_ID
      );

      if (errors.length > 0) {
        const abandoned = await dlqRepository.abandonExhaustedEntries();
        if (abandoned > 0) {
          logger.warn(`DLQ manual replay: ${abandoned} entries abandoned after max retries`);
          notifyAbandonAudit(abandoned);
        }
      }

      span.setAttribute('replayed', successCount);
      span.setAttribute('failed', errors.length);

      const details: Record<string, unknown> = { batchId, replayed: successCount, failed: errors.length };
      if (errors.length > 0) details.errors = errors;
      if (successCount > 0) metrics.entriesReplayed.inc(successCount);
      if (errors.length > 0) metrics.entriesReplayFailed.inc(errors.length);
      notifyReplayAudit(batchId, parsed.data.topic, successCount, errors.length);

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return sendResponse(details, 200);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.end();
      throw err;
    }
  });
});

export async function pruneOldEntries(): Promise<number> {
  try {
    const pruned = await dlqRepository.prune(env.MAX_ENTRIES);
    if (pruned > 0) {
      metrics.entriesPruned.inc(pruned);
      logger.info(`Pruned ${pruned} old DLQ entries`);
    }
    return pruned;
  } catch (err) {
    logger.error('DLQ periodic prune failed', { error: (err as Error)?.message });
    metrics.pruneErrors.inc(1);
    return 0;
  }
}

export function startPeriodicPrune(): void {
  if (pruneTimer) return;
  logger.info('Starting periodic DLQ prune', { intervalMs: env.DLQ_PRUNE_INTERVAL_MS });
  pruneTimer = setInterval(() => {
    pruneOldEntries().catch(err => {
      logger.warn('Periodic prune iteration failed', { error: (err as Error)?.message });
    });
  }, env.DLQ_PRUNE_INTERVAL_MS);
  pruneTimer.unref();
}

export function stopPeriodicPrune(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

export async function autoRetryTick(): Promise<void> {
  if (!env.DLQ_AUTO_RETRY_ENABLED) return;
  if (shuttingDown) return;
  const messageManagerUrl = await resolveMessageManagerUrl();
  if (!messageManagerUrl) {
    logger.warn('DLQ auto-retry: cannot resolve message-manager URL, skipping cycle');
    return;
  }
  if (shuttingDown) return;

  await dlqRepository.releaseStaleClaims();

  const batchId = `auto-retry-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const topic = undefined;
  const entries = await dlqRepository.claimEntriesForRetry(env.DLQ_AUTO_RETRY_LIMIT, batchId, env.INSTANCE_ID);
  if (entries.length === 0) {
    const abandoned = await dlqRepository.abandonExhaustedEntries();
    if (abandoned > 0) {
      logger.warn(`DLQ auto-retry: ${abandoned} entries abandoned after max retries`);
      notifyAbandonAudit(abandoned);
    }
    return;
  }

  logger.info(`DLQ auto-retry: replaying ${entries.length} entries`);
  const { success, errors } = await doReplayBatch(
    entries.map(e => ({ id: e.id, message: e.message })),
    messageManagerUrl,
    batchId,
    env.INSTANCE_ID
  );

  if (success > 0) metrics.entriesReplayed.inc(success);
  if (errors.length > 0) metrics.entriesReplayFailed.inc(errors.length);
  notifyReplayAudit(batchId, topic, success, errors.length);

  if (errors.length > 0) {
    const abandoned = await dlqRepository.abandonExhaustedEntries();
    if (abandoned > 0) {
      logger.warn(`DLQ auto-retry: ${abandoned} entries abandoned after max retries`);
      notifyAbandonAudit(abandoned);
    }
  }

  logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
}

async function runAutoRetryTick(): Promise<void> {
  try {
    await autoRetryTick();
  } catch (err) {
    logger.error('DLQ auto-retry tick failed', { error: (err as Error)?.message });
  }
  if (!shuttingDown) {
    scheduleAutoRetryTick();
  }
}

async function processRedisQueue(): Promise<void> {
  if (shuttingDown) return;
  if (!dlqRedisQueue.isAvailable()) return;

  const messageManagerUrl = await resolveMessageManagerUrl();
  if (!messageManagerUrl) return;

  await dlqRepository.releaseStaleClaims();

  const entryIds: string[] = [];
  for (let i = 0; i < env.DLQ_AUTO_RETRY_LIMIT; i++) {
    const entryId = await dlqRedisQueue.pop();
    if (!entryId) break;
    entryIds.push(entryId);
  }

  if (entryIds.length === 0) return;

  const batchId = `redis-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const validIds = entryIds.filter(id => ObjectId.isValid(id));

  if (validIds.length === 0) return;

  const claimed = await dlqRepository.claimEntriesByIds(validIds, batchId, env.INSTANCE_ID);
  if (claimed.length === 0) return;

  if (shuttingDown) {
    for (const remaining of entryIds) {
      dlqRedisQueue.push(remaining).catch(() => {});
    }
    return;
  }

  entries.push(...claimed.map(e => ({ id: e.id, message: e.message })));

  if (entries.length === 0) return;

  logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
  const { success, errors } = await doReplayBatch(entries, messageManagerUrl, batchId, env.INSTANCE_ID);

  if (success > 0) metrics.entriesReplayed.inc(success);
  if (errors.length > 0) metrics.entriesReplayFailed.inc(errors.length);

  if (errors.length > 0) {
    const abandoned = await dlqRepository.abandonExhaustedEntries();
    if (abandoned > 0) {
      logger.warn(`DLQ Redis queue: ${abandoned} entries abandoned after max retries`);
      notifyAbandonAudit(abandoned);
    }
  }

  logger.info(`DLQ Redis queue: ${success} replayed, ${errors.length} failed`);
}

function scheduleAutoRetryTick(): void {
  const baseInterval = env.DLQ_AUTO_RETRY_INTERVAL_MS;
  const jitter = Math.floor(Math.random() * baseInterval * 0.2) - Math.floor(baseInterval * 0.1);
  autoRetryTimer = setTimeout(() => {
    runAutoRetryTick();
  }, baseInterval + jitter);
  autoRetryTimer.unref();
}

export async function rebuildQueueFromMongo(): Promise<void> {
  try {
    const entries = await dlqRepository.listQueuable();
    for (const entryId of entries) {
      dlqRedisQueue.push(entryId).catch(() => {});
    }
    logger.info('Redis queue rebuilt from MongoDB', { pushedCount: entries.length });
  } catch (err) {
    logger.warn('Failed to rebuild Redis queue from MongoDB', { error: (err as Error)?.message });
  }
}

export function startAutoRetry(): void {
  if (!env.DLQ_AUTO_RETRY_ENABLED) return;
  if (autoRetryTimer) return;
  logger.info('Starting DLQ auto-retry scheduler', { intervalMs: env.DLQ_AUTO_RETRY_INTERVAL_MS });
  const jitterMs = Math.floor(Math.random() * env.DLQ_AUTO_RETRY_INTERVAL_MS);
  autoRetryStartTimer = setTimeout(() => {
    autoRetryStartTimer = null;
    scheduleAutoRetryTick();
  }, jitterMs);
  autoRetryStartTimer.unref();

  const REDIS_WORKER_INTERVAL_MS = 1000;
  async function redisWorkerLoop(): Promise<void> {
    if (shuttingDown) return;
    try {
      await processRedisQueue();
    } catch (err) {
      logger.error('DLQ Redis queue worker error', { error: (err as Error)?.message });
    }
    if (!shuttingDown) {
      redisRetryTimer = setTimeout(redisWorkerLoop, REDIS_WORKER_INTERVAL_MS);
      redisRetryTimer.unref();
    }
  }
  redisWorkerLoop();
}

export function stopAutoRetry(): void {
  if (autoRetryStartTimer) {
    clearTimeout(autoRetryStartTimer);
    autoRetryStartTimer = null;
  }
  if (autoRetryTimer) {
    clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
  }
  if (redisRetryTimer) {
    clearTimeout(redisRetryTimer);
    redisRetryTimer = null;
  }
}

export async function releaseStaleClaims(staleThresholdMs?: number): Promise<void> {
  const released = await dlqRepository.releaseStaleClaims(staleThresholdMs);
  if (released > 0) {
    logger.info(`Released ${released} stale claims from previous instance`);
  }
}

export async function shutdownSchedulers(): Promise<void> {
  shuttingDown = true;
  stopPeriodicPrune();
  stopAutoRetry();

    if (activeReplays.count > 0) {
      logger.info(`Waiting for ${activeReplays.count} in-flight replays to complete`);
      const drainTimeout = 10_000;
      const deadline = Date.now() + drainTimeout;
      while (activeReplays.count > 0 && Date.now() < deadline) {
        await new Promise<void>(r => { const t = setTimeout(r, 100); t.unref(); });
      }
      if (activeReplays.count > 0) {
        logger.warn(`${activeReplays.count} replays did not complete within drain timeout — releasing their claims`);
        await dlqRepository.releaseAllActiveClaims();
        await new Promise<void>(r => { const t = setTimeout(r, 500); t.unref(); });
        await dlqRepository.releaseAllActiveClaims();
      }
    }

  const releasedCount = await dlqRepository.releaseClaimsByInstance(env.INSTANCE_ID);
  if (releasedCount > 0 && dlqRedisQueue.isAvailable()) {
    const allQueuable = await dlqRepository.listQueuable();
    // De-duplicate via Set before pushing, then push only the number of released entries
    // to avoid flooding the queue with entries already present
    const uniqueIds = [...new Set(allQueuable)];
    const toPush = uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
    for (const id of toPush) {
      dlqRedisQueue.push(id).catch(() => {});
    }
    logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
  }
  await dlqRedisQueue.close();
  await closeHttpClient();
}
