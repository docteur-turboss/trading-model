import { claimReplayOrchestrator } from "../../config/container";
import { RedisWorkerTimer } from "../../infrastructure/redis-worker-timer";
import { claimReleaseManager } from "../outbound/claim-manager";
import { resolveMessageManagerUrl } from "../outbound/message-manager-resolver";
import { queuePopService } from "../outbound/redis-queue-pop-service";

export async function processRedisQueue(): Promise<void> {
	if (queuePopService.shouldSkip()) {
		return;
	}

	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		return;
	}

	await claimReleaseManager.releaseStaleClaims();

	const entryIds = await queuePopService.popEntries();
	if (entryIds.length === 0) {
		return;
	}

	await claimReplayOrchestrator.claimAndReplay(entryIds, messageManagerUrl);
}

export const redisWorkerTimer = new RedisWorkerTimer(processRedisQueue);

export function startRedisWorkerLoop(): void {
	redisWorkerTimer.start();
}

export function stopRedisWorkerTimer(): void {
	redisWorkerTimer.stop();
}
