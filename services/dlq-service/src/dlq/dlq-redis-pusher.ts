import { logger } from "../config/logger";
import { dlqRedisQueue } from "../config/redis-queue";

export async function pushToRedisQueue(id: string): Promise<void> {
	try {
		await Promise.race([dlqRedisQueue.push(id), _redisPushTimeout()]);
	} catch (err) {
		_logRedisPushError(id, err);
	}
}

function _redisPushTimeout(): Promise<void> {
	return new Promise<void>((_, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Redis push timeout")),
			2000
		);
		timer.unref();
	});
}

function _logRedisPushError(entryId: string, err: unknown): void {
	logger.warn("Failed to push entry to Redis queue", {
		entryId,
		error: (err as Error)?.message,
	});
}
