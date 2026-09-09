import { queuePopService } from "../../adapters/outbound/redis-queue-pop-service";
import { resolveMessageManagerUrl } from "../../dlq/shared/message-manager-resolver";
import { RedisWorkerTimer } from "../../infrastructure/redis-worker-timer";
import { claimReleaseManager } from "./claim-manager";
import { claimReplayOrchestrator } from "./redis-claim-replay-orchestrator";

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
