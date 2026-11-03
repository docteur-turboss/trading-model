import { logger } from "../../config/logger";
import type {
	QueuableEntriesPort,
	ReplayQueuePort,
} from "../../domain/ports/replay.ports";

export interface QueueRebuilderDeps {
	entries: QueuableEntriesPort;
	queue: ReplayQueuePort;
}

/** Re-seeds the Redis replay queue from the queuable entries stored in MongoDB. */
export function createQueueRebuilder(
	deps: QueueRebuilderDeps
): () => Promise<void> {
	return async () => {
		try {
			const entries = await deps.entries.listQueuable();
			const results = await Promise.all(
				entries.map((entryId) => deps.queue.push(entryId))
			);
			const pushedCount = results.filter(Boolean).length;
			const context = { pushedCount, queuableCount: entries.length };
			if (pushedCount < entries.length) {
				logger.warn("Redis queue partially rebuilt from MongoDB", context);
			} else {
				logger.info("Redis queue rebuilt from MongoDB", context);
			}
		} catch (err) {
			logger.warn("Failed to rebuild Redis queue from MongoDB", {
				error: (err as Error)?.message,
			});
		}
	};
}
