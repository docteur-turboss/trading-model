import { randomUUID } from "node:crypto";

import { findAService } from "../config/address-manager";
import { notifyAudit } from "../config/audit";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqClaimManager } from "./claim-manager";
import { dlqRedisQueue } from "../config/redis-queue";
import { doReplayBatch } from "./replay-pipeline";
import { dlqRepository } from "./repository";
import { dlqRetryManager } from "./retry-manager";
import { isShuttingDown } from "./shared/index";
import {
	startRedisWorkerLoop,
	stopRedisWorkerTimer,
} from "./redis-queue-processor";

let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
let autoRetryStartTimer: ReturnType<typeof setTimeout> | null = null;

export async function resolveMessageManagerUrl(): Promise<string | null> {
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

export async function handleAbandonedEntries(source: string): Promise<void> {
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
	const result = await doReplayBatch({
		entries,
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
	});
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

	const batchId = _generateBatchId("auto-retry");
	const entries = await _claimEntriesForRetry(batchId);
	if (entries.length === 0) {
		await handleAbandonedEntries("DLQ auto-retry");
		return;
	}

	const { success, errors } = await executeAutoRetryReplay(
		entries.map((entry) => ({ id: entry.id, message: entry.message })),
		messageManagerUrl,
		batchId
	);

	_notifyAutoRetryResult(batchId, success, errors.length);

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ auto-retry");
	}

	logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
}

function _generateBatchId(prefix: string): string {
	return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function _claimEntriesForRetry(
	batchId: string
): Promise<Array<{ id: string; message: unknown }>> {
	return dlqClaimManager.claimEntriesForRetry({
		limit: env.DLQ_AUTO_RETRY_LIMIT,
		batchId,
		instanceId: env.INSTANCE_ID,
	});
}

function _notifyAutoRetryResult(
	batchId: string,
	success: number,
	errorsCount: number
): void {
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${success} succeeded, ${errorsCount} failed`,
		severity: errorsCount > 0 ? "ERROR" : "INFO",
	});
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
		_pushAllToRedis(entries);
		logger.info("Redis queue rebuilt from MongoDB", {
			pushedCount: entries.length,
		});
	} catch (err) {
		_logRebuildError(err);
	}
}

function _pushAllToRedis(entries: string[]): void {
	for (const entryId of entries) {
		void dlqRedisQueue.push(entryId);
	}
}

function _logRebuildError(err: unknown): void {
	logger.warn("Failed to rebuild Redis queue from MongoDB", {
		error: (err as Error)?.message,
	});
}

export function startAutoRetry(): void {
	if (!env.DLQ_AUTO_RETRY_ENABLED) {
		return;
	}
	if (autoRetryTimer) {
		return;
	}
	_logAutoRetryStart();
	_scheduleInitialTick();
	void startRedisWorkerLoop();
}

function _logAutoRetryStart(): void {
	logger.info("Starting DLQ auto-retry scheduler", {
		intervalMs: env.DLQ_AUTO_RETRY_INTERVAL_MS,
	});
}

function _scheduleInitialTick(): void {
	const jitterMs = Math.floor(Math.random() * env.DLQ_AUTO_RETRY_INTERVAL_MS);
	autoRetryStartTimer = setTimeout(() => {
		autoRetryStartTimer = null;
		scheduleAutoRetryTick();
	}, jitterMs);
	autoRetryStartTimer.unref();
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
	stopRedisWorkerTimer();
}

export { processRedisQueue, startRedisWorkerLoop } from "./redis-queue-processor";
