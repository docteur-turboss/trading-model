import { withTimeout } from "@trading-model/common/utils/retry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { logger } from "../../config/logger";
import { dlqRedisQueue } from "../../config/redis-queue";

export async function pushToRedisQueue(id: string): Promise<void> {
	try {
		await withTimeout(
			dlqRedisQueue.push(id),
			DurationMs.of(2000),
			"Redis push timeout"
		);
	} catch (err) {
		_logRedisPushError(id, err);
	}
}

function _logRedisPushError(entryId: string, err: unknown): void {
	logger.warn("Failed to push entry to Redis queue", {
		entryId,
		error: (err as Error)?.message,
	});
}
