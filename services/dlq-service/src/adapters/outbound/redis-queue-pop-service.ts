import { dlqRedisQueue } from "../../config/redis-queue";
import { ENV } from "../../infrastructure/config/env";
import { isShuttingDown } from "../../shared/shutdown-flag";

export class QueuePopService {
	popEntries(): Promise<string[]> {
		return dlqRedisQueue.popMany(ENV.DLQ_AUTO_RETRY_LIMIT);
	}

	shouldSkip(): boolean {
		return isShuttingDown() || !dlqRedisQueue.isAvailable();
	}
}
