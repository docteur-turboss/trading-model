import { dlqRedisQueue } from "../../config/redis-queue";
import { isShuttingDown } from "../../dlq/shared/shutdown-flag";
import { ENV } from "../../infrastructure/config/env";

export class QueuePopService {
	async popEntries(): Promise<string[]> {
		const entryIds: string[] = [];
		for (let i = 0; i < ENV.DLQ_AUTO_RETRY_LIMIT; i++) {
			const entryId = await dlqRedisQueue.pop();
			if (!entryId) {
				break;
			}
			entryIds.push(entryId);
		}
		return entryIds;
	}

	shouldSkip(): boolean {
		if (isShuttingDown()) {
			return true;
		}
		if (!dlqRedisQueue.isAvailable()) {
			return true;
		}
		return false;
	}
}

export const queuePopService = new QueuePopService();
