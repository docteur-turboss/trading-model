import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

import type { ServiceRegistry } from "./service-registry";
import type { ServiceInstance } from "./types";
import { isAliveInstance } from "./expiration";
import { ExpiredInstanceCleaner } from "./expired-instance-cleaner";

export class LeaseManager {
	private _cleanupIntervalMs: number;
	private readonly _intervalHandle = new TimerHandle();
	private readonly _expiredCleaner: ExpiredInstanceCleaner;

	constructor(
		private readonly _registry: ServiceRegistry,
		options?: { cleanupIntervalMs?: number }
	) {
		this._cleanupIntervalMs = options?.cleanupIntervalMs ?? 5000;
		this._expiredCleaner = new ExpiredInstanceCleaner(_registry);
	}

	start(): void {
		if (this._intervalHandle.isRunning) return;
		this._intervalHandle.startInterval(() => {
			try { this._expiredCleaner.cleanupExpiredInstances(); } catch (err) {
				logger.error("Cleanup error", { error: normalizeError(err) });
			}
		}, this._cleanupIntervalMs);
		logger.info("Cleanup loop started", { cleanupIntervalMs: this._cleanupIntervalMs });
	}

	stop(): void {
		this._intervalHandle.stop();
		logger.info("Cleanup loop stopped");
	}

	isAlive(instance: ServiceInstance): boolean {
		return isAliveInstance(instance);
	}
}
