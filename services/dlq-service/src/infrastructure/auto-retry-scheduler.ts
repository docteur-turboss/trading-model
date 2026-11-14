import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { LogPort, ShutdownProbe } from "../domain/ports/replay.port";
import type { Env } from "./config/env";

/** What the scheduler reads from the environment. */
type AutoRetrySchedulerSettings = Pick<
	Env,
	"DLQ_AUTO_RETRY_ENABLED" | "DLQ_AUTO_RETRY_INTERVAL_MS"
>;

export interface AutoRetrySchedulerDeps {
	env: AutoRetrySchedulerSettings;
	/** One auto-retry cycle. */
	tick(): Promise<void>;
	/** The Redis worker loop that runs alongside the cycle. */
	redisWorker: { start(): void; stop(): void };
	logger: LogPort;
	isShuttingDown: ShutdownProbe;
}

export interface AutoRetryScheduler {
	start(): void;
	stop(): void;
}

export function createAutoRetryScheduler(
	deps: AutoRetrySchedulerDeps
): AutoRetryScheduler {
	const { env, logger, isShuttingDown } = deps;
	const autoRetryTimer = new TimerHandle();
	const autoRetryStartTimer = new TimerHandle();

	function scheduleAutoRetryTick(): void {
		const baseInterval = env.DLQ_AUTO_RETRY_INTERVAL_MS;
		const jitter =
			Math.floor(Math.random() * baseInterval * 0.2) -
			Math.floor(baseInterval * 0.1);
		autoRetryTimer.startTimeout(
			() => {
				void runAutoRetryTick();
			},
			DurationMs.of(baseInterval + jitter)
		);
	}

	async function runAutoRetryTick(): Promise<void> {
		try {
			await deps.tick();
		} catch (err) {
			logger.error("DLQ auto-retry tick failed", {
				error: normalizeError(err).message,
			});
		}
		if (!isShuttingDown()) {
			scheduleAutoRetryTick();
		}
	}

	function scheduleInitialTick(): void {
		const jitterMs = Math.floor(Math.random() * env.DLQ_AUTO_RETRY_INTERVAL_MS);
		autoRetryStartTimer.startTimeout(() => {
			scheduleAutoRetryTick();
		}, DurationMs.of(jitterMs));
	}

	return {
		start() {
			if (!env.DLQ_AUTO_RETRY_ENABLED) {
				return;
			}
			if (autoRetryTimer.isRunning) {
				return;
			}
			logger.info("Starting DLQ auto-retry scheduler", {
				intervalMs: env.DLQ_AUTO_RETRY_INTERVAL_MS,
			});
			scheduleInitialTick();
			deps.redisWorker.start();
		},
		stop() {
			autoRetryStartTimer.stop();
			autoRetryTimer.stop();
			deps.redisWorker.stop();
		},
	};
}
