import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";

/** Connects the Redis queue and re-seeds it from MongoDB on every reconnect. */
export async function ensureRedisQueue(
	queue: { connect(onReconnect?: () => void): Promise<boolean> },
	rebuildQueueFromMongo: () => Promise<void>
): Promise<void> {
	try {
		await queue.connect(() => {
			void rebuildQueueFromMongo();
		});
	} catch (err) {
		logger.warn(
			"Redis queue unavailable on start — operations continue in DEGRADED mode",
			{ error: normalizeError(err) }
		);
	}
}
