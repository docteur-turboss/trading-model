import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqClaimManager } from "./claim-manager";
import { dlqRepository } from "./repository";
import {
	activeReplays,
	closeHttpClient,
	setShuttingDown,
} from "./shared/index";
import { stopAutoRetry } from "./auto-retry";

const pruneTimer = new TimerHandle();

async function pruneOldEntries(): Promise<number> {
	try {
		const pruned = await dlqRepository.prune(env.MAX_ENTRIES);
		if (pruned > 0) {
			metrics.entriesPruned.inc(pruned);
			logger.info(`Pruned ${pruned} old DLQ entries`);
		}
		return pruned;
	} catch (err) {
		return _handlePruneError(err);
	}
}

function _handlePruneError(err: unknown): number {
	logger.error("DLQ periodic prune failed", {
		error: (err as Error)?.message,
	});
	metrics.pruneErrors.inc(1);
	return 0;
}

function startPeriodicPrune(): void {
	if (pruneTimer.isRunning) {
		return;
	}
	_logPruneStart();
	pruneTimer.startInterval(() => {
		pruneOldEntries().catch((err) => {
			_logPruneIterationError(err);
		});
	}, env.DLQ_PRUNE_INTERVAL_MS);
	pruneTimer.unref();
}

function _logPruneStart(): void {
	logger.info("Starting periodic DLQ prune", {
		intervalMs: env.DLQ_PRUNE_INTERVAL_MS,
	});
}

function _logPruneIterationError(err: unknown): void {
	logger.warn("Periodic prune iteration failed", {
		error: (err as Error)?.message,
	});
}

function stopPeriodicPrune(): void {
	pruneTimer.stop();
}

async function drainActiveReplays(): Promise<void> {
	if (activeReplays.count === 0) {
		return;
	}

	logger.info(
		`Waiting for ${activeReplays.count} in-flight replays to complete`
	);
	await _waitForReplays();

	if (activeReplays.count === 0) {
		return;
	}

	await _forceReleaseClaims();
}

async function _waitForReplays(): Promise<void> {
	const drainTimeout = 10_000;
	const deadline = Date.now() + drainTimeout;
	while (activeReplays.count > 0 && Date.now() < deadline) {
		await _sleep(100);
	}
}

async function _forceReleaseClaims(): Promise<void> {
	logger.warn(
		`${activeReplays.count} replays did not complete within drain timeout — releasing their claims`
	);
	await dlqClaimManager.releaseAllActiveClaims();
	await _sleep(500);
	await dlqClaimManager.releaseAllActiveClaims();
}

function _sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
	});
}

async function releaseAndRequeueClaims(): Promise<void> {
	const releasedCount = await dlqClaimManager.releaseClaimsByInstance(
		env.INSTANCE_ID
	);
	if (releasedCount > 0 && dlqRedisQueue.isAvailable()) {
		const toPush = await _computeRequeueBatch(releasedCount);
		for (const id of toPush) {
			dlqRedisQueue.push(id).catch(() => {});
		}
		logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
	}
}

async function _computeRequeueBatch(releasedCount: number): Promise<string[]> {
	const allQueuable = await dlqRepository.listQueuable();
	const uniqueIds = [...new Set(allQueuable)];
	return uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
}

async function releaseStaleClaims(
	staleThresholdMs?: number
): Promise<void> {
	const released = await dlqClaimManager.releaseStaleClaims(staleThresholdMs);
	if (released > 0) {
		logger.info(`Released ${released} stale claims from previous instance`);
	}
}

async function shutdownSchedulers(): Promise<void> {
	setShuttingDown(true);
	stopPeriodicPrune();
	stopAutoRetry();
	await drainActiveReplays();
	await releaseAndRequeueClaims();
	await dlqRedisQueue.close();
	await closeHttpClient();
}

export {
	pruneOldEntries,
	releaseStaleClaims,
	shutdownSchedulers,
	startPeriodicPrune,
	stopPeriodicPrune,
};
