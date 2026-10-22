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
			for (const entryId of entries) {
				void deps.queue.push(entryId);
			}
			logger.info("Redis queue rebuilt from MongoDB", {
				pushedCount: entries.length,
			});
		} catch (err) {
			logger.warn("Failed to rebuild Redis queue from MongoDB", {
				error: (err as Error)?.message,
			});
		}
	};
}
