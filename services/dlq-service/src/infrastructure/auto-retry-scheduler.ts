import { DurationMs } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import {
	startRedisWorkerLoop,
	stopRedisWorkerTimer,
} from "../application/services/redis-queue-processor";
import { logger } from "../config/logger";
import { isShuttingDown } from "../dlq/shared/shutdown-flag";
import { autoRetryTick } from "../shared/auto-retry";
import { ENV } from "./config/env";

const autoRetryTimer = new TimerHandle();
const autoRetryStartTimer = new TimerHandle();

function scheduleAutoRetryTick(): void {
	const baseInterval = ENV.DLQ_AUTO_RETRY_INTERVAL_MS;
	const jitter =
		Math.floor(Math.random() * baseInterval * 0.2) -
		Math.floor(baseInterval * 0.1);
	autoRetryTimer.startTimeout(
		() => {
			void runAutoRetryTick();
		},
		DurationMs.of(baseInterval + jitter)
	);
	autoRetryTimer.unref();
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

function scheduleInitialTick(): void {
	const jitterMs = Math.floor(Math.random() * ENV.DLQ_AUTO_RETRY_INTERVAL_MS);
	autoRetryStartTimer.startTimeout(() => {
		scheduleAutoRetryTick();
	}, DurationMs.of(jitterMs));
	autoRetryStartTimer.unref();
}

export function startAutoRetry(): void {
	if (!ENV.DLQ_AUTO_RETRY_ENABLED) {
		return;
	}
	if (autoRetryTimer.isRunning) {
		return;
	}
	logger.info("Starting DLQ auto-retry scheduler", {
		intervalMs: ENV.DLQ_AUTO_RETRY_INTERVAL_MS,
	});
	scheduleInitialTick();
	void startRedisWorkerLoop();
}

export function stopAutoRetry(): void {
	autoRetryStartTimer.stop();
	autoRetryTimer.stop();
	stopRedisWorkerTimer();
}
