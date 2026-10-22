import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { dlqRedisQueue } from "../config/redis-queue";
import { rebuildQueueFromMongo } from "../shared/controller-reexports";

export async function ensureRedisQueue(): Promise<void> {
	try {
		await dlqRedisQueue.connect(() => {
			void rebuildQueueFromMongo();
		});
	} catch (err) {
		logger.warn(
			"Redis queue unavailable on start — operations continue in DEGRADED mode",
			{ error: normalizeError(err) }
		);
	}
}
