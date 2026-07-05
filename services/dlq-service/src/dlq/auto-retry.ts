import { randomUUID } from "node:crypto";

import { ObjectId } from "mongodb";
import { findAService } from "../config/address-manager";
import { notifyAudit } from "../config/audit";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqClaimManager } from "./claim-manager";
import { doReplayBatch, isShuttingDown } from "./replay-pipeline";
import { dlqRepository } from "./repository";
import { dlqRetryManager } from "./retry-manager";

let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
let autoRetryStartTimer: ReturnType<typeof setTimeout> | null = null;
let redisRetryTimer: ReturnType<typeof setTimeout> | null = null;

async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = env.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		try {
			const target = await findAService("message-manager" as never);
			if (target) {
				url = `https://${target.ip}:${target.port}`;
			}
		} catch {
			logger.warn("DLQ address-manager resolution failed");
		}
	}
	return url;
}

async function handleAbandonedEntries(source: string): Promise<void> {
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(`${source}: ${abandoned} entries abandoned after max retries`);
	}
}

async function resolveMMUrlOrSkip(): Promise<string | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		logger.warn(
			"DLQ auto-retry: cannot resolve message-manager URL, skipping cycle"
		);
		return null;
	}
	return messageManagerUrl;
}

async function executeAutoRetryReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
	logger.info(`DLQ auto-retry: replaying ${entries.length} entries`);
	const result = await doReplayBatch(
		entries,
		messageManagerUrl,
		batchId,
		env.INSTANCE_ID
	);
	if (result.success > 0) {
		metrics.entriesReplayed.inc(result.success);
	}
	if (result.errors.length > 0) {
		metrics.entriesReplayFailed.inc(result.errors.length);
	}
	return result;
}

async function _executeAutoRetryCycle(
	messageManagerUrl: string
): Promise<void> {
	await dlqClaimManager.releaseStaleClaims();

	const batchId = `auto-retry-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const entries = await dlqClaimManager.claimEntriesForRetry(
		env.DLQ_AUTO_RETRY_LIMIT,
		batchId,
		env.INSTANCE_ID
	);
	if (entries.length === 0) {
		await handleAbandonedEntries("DLQ auto-retry");
		return;
	}

	const { success, errors } = await executeAutoRetryReplay(
		entries.map((entry) => ({ id: entry.id, message: entry.message })),
		messageManagerUrl,
		batchId
	);

	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${success} succeeded, ${errors.length} failed`,
		severity: errors.length > 0 ? "ERROR" : "INFO",
	});

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ auto-retry");
	}

	logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
}

export async function autoRetryTick(): Promise<void> {
	if (!env.DLQ_AUTO_RETRY_ENABLED || isShuttingDown()) {
		return;
	}

	const messageManagerUrl = await resolveMMUrlOrSkip();
	if (!messageManagerUrl || isShuttingDown()) {
		return;
	}

	await _executeAutoRetryCycle(messageManagerUrl);
}

async function runAutoRetryTick(): Promise<void> {
	try {
		await autoRetryTick();
	} catch (err) {
		logger.error("DLQ auto-retry tick failed", {
			error: (err as Error)?.message,
		});
	}
	if (!isShuttingDown()) {
		scheduleAutoRetryTick();
	}
}

async function _popRedisQueueEntries(): Promise<string[]> {
	const entryIds: string[] = [];
	for (let i = 0; i < env.DLQ_AUTO_RETRY_LIMIT; i++) {
		const entryId = await dlqRedisQueue.pop();
		if (!entryId) {
			break;
		}
		entryIds.push(entryId);
	}
	return entryIds;
}

async function claimBatchEntries(
	entryIds: string[],
	batchId: string
): Promise<Array<{ id: string; message: unknown }> | null> {
	const validIds = entryIds.filter((id) => ObjectId.isValid(id));
	if (validIds.length === 0) {
		return null;
	}

	const claimed = await dlqClaimManager.claimEntriesByIds(
		validIds,
		batchId,
		env.INSTANCE_ID
	);
	if (claimed.length === 0) {
		return null;
	}

	if (isShuttingDown()) {
		for (const remaining of entryIds) {
			void dlqRedisQueue.push(remaining);
		}
		return null;
	}

	return claimed.map((entry) => ({ id: entry.id, message: entry.message }));
}

async function executeClaimReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string
): Promise<void> {
	logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
	const { success, errors } = await doReplayBatch(
		entries,
		messageManagerUrl,
		batchId,
		env.INSTANCE_ID
	);

	if (success > 0) {
		metrics.entriesReplayed.inc(success);
	}
	if (errors.length > 0) {
		metrics.entriesReplayFailed.inc(errors.length);
	}

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ Redis queue");
	}

	logger.info(`DLQ Redis queue: ${success} replayed, ${errors.length} failed`);
}

async function _claimAndReplayEntries(
	entryIds: string[],
	messageManagerUrl: string
): Promise<void> {
	const batchId = `redis-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const entries = await claimBatchEntries(entryIds, batchId);
	if (!entries || entries.length === 0) {
		return;
	}
	await executeClaimReplay(entries, messageManagerUrl, batchId);
}

async function processRedisQueue(): Promise<void> {
	if (isShuttingDown()) {
		return;
	}
	if (!dlqRedisQueue.isAvailable()) {
		return;
	}

	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		return;
	}

	await dlqClaimManager.releaseStaleClaims();

	const entryIds = await _popRedisQueueEntries();

	if (entryIds.length === 0) {
		return;
	}

	await _claimAndReplayEntries(entryIds, messageManagerUrl);
}

function scheduleAutoRetryTick(): void {
	const baseInterval = env.DLQ_AUTO_RETRY_INTERVAL_MS;
	const jitter =
		Math.floor(Math.random() * baseInterval * 0.2) -
		Math.floor(baseInterval * 0.1);
	autoRetryTimer = setTimeout(() => {
		void runAutoRetryTick();
	}, baseInterval + jitter);
	autoRetryTimer.unref();
}

export async function rebuildQueueFromMongo(): Promise<void> {
	try {
		const entries = await dlqRepository.listQueuable();
		for (const entryId of entries) {
			void dlqRedisQueue.push(entryId);
		}
		logger.info("Redis queue rebuilt from MongoDB", {
			pushedCount: entries.length,
		});
	} catch (err) {
		logger.warn("Failed to rebuild Redis queue from MongoDB", {
			error: (err as Error)?.message,
		});
	}
}

const RedisWorkerIntervalMs = 1000;

function startRedisWorkerLoop(): void {
	async function redisWorkerLoop(): Promise<void> {
		if (isShuttingDown()) {
			return;
		}
		try {
			await processRedisQueue();
		} catch (err) {
			logger.error("DLQ Redis queue worker error", {
				error: (err as Error)?.message,
			});
		}
		if (!isShuttingDown()) {
			redisRetryTimer = setTimeout(redisWorkerLoop, RedisWorkerIntervalMs);
			redisRetryTimer.unref();
		}
	}
	void redisWorkerLoop();
}

export function startAutoRetry(): void {
	if (!env.DLQ_AUTO_RETRY_ENABLED) {
		return;
	}
	if (autoRetryTimer) {
		return;
	}
	logger.info("Starting DLQ auto-retry scheduler", {
		intervalMs: env.DLQ_AUTO_RETRY_INTERVAL_MS,
	});
	const jitterMs = Math.floor(Math.random() * env.DLQ_AUTO_RETRY_INTERVAL_MS);
	autoRetryStartTimer = setTimeout(() => {
		autoRetryStartTimer = null;
		scheduleAutoRetryTick();
	}, jitterMs);
	autoRetryStartTimer.unref();

	void startRedisWorkerLoop();
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
