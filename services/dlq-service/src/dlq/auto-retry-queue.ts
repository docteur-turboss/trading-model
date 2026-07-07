import { logger } from "../config/logger";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqRepository } from "./repository";

export async function rebuildQueueFromMongo(): Promise<void> {
	try {
		const entries = await dlqRepository.listQueuable();
		_pushAllToRedis(entries);
		logger.info("Redis queue rebuilt from MongoDB", {
			pushedCount: entries.length,
		});
	} catch (err) {
		_logRebuildError(err);
	}
}

function _pushAllToRedis(entries: string[]): void {
	for (const entryId of entries) {
		void dlqRedisQueue.push(entryId);
	}
}

function _logRebuildError(err: unknown): void {
	logger.warn("Failed to rebuild Redis queue from MongoDB", {
		error: (err as Error)?.message,
	});
}
