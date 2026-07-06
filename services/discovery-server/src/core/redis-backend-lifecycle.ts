import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";

export class RedisBackendLifecycle {
	constructor(
		private readonly _redis: Redis,
		private readonly _cleaner: StaleInstanceCleaner,
	) {}

	start(): void {
		this._redis.connect().catch((err) => {
			logger.error("Failed to connect to Redis", {
				error: normalizeError(err),
			});
		});

		this._cleaner.start();

		logger.info("RedisRegistryBackend started");
	}

	stop(): void {
		this._cleaner.stop();
		this._redis.disconnect();
		logger.info("RedisRegistryBackend stopped");
	}

	async forceCleanup(): Promise<void> {
		await this._cleaner.cleanupNow();
	}
}
