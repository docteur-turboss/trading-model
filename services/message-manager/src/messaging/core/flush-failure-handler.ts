import { logger } from "../../config/logger";
import type { MemoryWalEntry } from "./memory-wal-entry";
import type { RedisBackoff } from "./redis-backoff";

export class FlushFailureHandler {
	async handle(
		batch: MemoryWalEntry[],
		redisBackoff: RedisBackoff,
		buffer?: MemoryWalEntry[],
		err?: Error
	): Promise<void> {
		redisBackoff.markDown();
		redisBackoff.increaseBackoff();
		if (err) {
			logger.warn("Memory WAL flush failed — re-queuing batch", {
				batchSize: batch.length,
				backoff: redisBackoff.current,
				error: err.message,
			});
		} else {
			logger.warn("Memory WAL flush partial failure — re-queuing batch", {
				batchSize: batch.length,
				backoff: redisBackoff.current,
			});
		}
		if (buffer) {
			buffer.unshift(...batch);
		}
		await this._sleepWithJitter(redisBackoff.current);
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) => {
			const timer = setTimeout(resolve, Math.max(1, Math.round(ms + jitter)));
			timer.unref();
		});
	}
}
