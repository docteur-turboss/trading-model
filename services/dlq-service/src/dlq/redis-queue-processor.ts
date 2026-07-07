import { randomUUID } from "node:crypto";

import { ObjectId } from "mongodb";
import { ENV } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { resolveMessageManagerUrl } from "./address-resolver";
import { handleAbandonedEntries } from "./auto-retry";
import { dlqClaimManager } from "./claim-manager";
import { doReplayBatch } from "./replay-pipeline";
import { isShuttingDown } from "./shared/index";

export let redisRetryTimer: ReturnType<typeof setTimeout> | null = null;

async function _popRedisQueueEntries(): Promise<string[]> {
	const entryIds: string[] = [];
	for (let i = 0; i < ENV.DLQ_AUTO_RETRY_LIMIT; i++) {
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
	const validIds = _filterValidObjectIds(entryIds);
	if (validIds.length === 0) {
		return null;
	}

	const claimed = await _claimByIds(validIds, batchId);
	if (claimed.length === 0) {
		return null;
	}

	if (isShuttingDown()) {
		_requeueRemaining(entryIds);
		return null;
	}

	return claimed.map((entry) => ({ id: entry.id, message: entry.message }));
}

function _filterValidObjectIds(ids: string[]): string[] {
	return ids.filter((id) => ObjectId.isValid(id));
}

async function _claimByIds(
	validIds: string[],
	batchId: string
): Promise<Array<{ id: string; message: unknown }>> {
	return dlqClaimManager.claimEntriesByIds(validIds, {
		batchId,
		instanceId: ENV.INSTANCE_ID,
	});
}

function _requeueRemaining(entryIds: string[]): void {
	for (const remaining of entryIds) {
		void dlqRedisQueue.push(remaining);
	}
}

async function executeClaimReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string
): Promise<void> {
	logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
	const { success, errors } = await doReplayBatch({
		entries,
		messageManagerUrl,
		batchId,
		instanceId: ENV.INSTANCE_ID,
	});

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

export async function processRedisQueue(): Promise<void> {
	if (_shouldSkipRedisProcessing()) {
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

function _shouldSkipRedisProcessing(): boolean {
	if (isShuttingDown()) {
		return true;
	}
	if (!dlqRedisQueue.isAvailable()) {
		return true;
	}
	return false;
}

const RedisWorkerIntervalMs = 1000;

export function startRedisWorkerLoop(): void {
	void _redisWorkerLoop();
}

async function _redisWorkerLoop(): Promise<void> {
	if (isShuttingDown()) {
		return;
	}
	try {
		await processRedisQueue();
	} catch (err) {
		_logRedisWorkerError(err);
	}
	if (!isShuttingDown()) {
		_scheduleRedisTick();
	}
}

function _logRedisWorkerError(err: unknown): void {
	logger.error("DLQ Redis queue worker error", {
		error: (err as Error)?.message,
	});
}

function _scheduleRedisTick(): void {
	redisRetryTimer = setTimeout(_redisWorkerLoop, RedisWorkerIntervalMs);
	redisRetryTimer.unref();
}

export function stopRedisWorkerTimer(): void {
	if (redisRetryTimer) {
		clearTimeout(redisRetryTimer);
		redisRetryTimer = null;
	}
}
