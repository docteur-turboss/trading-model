import { resolveMessageManagerUrl } from "./address-resolver";
import { claimReleaseManager } from "./claim-manager";
import { claimReplayOrchestrator } from "./redis-claim-replay-orchestrator";
import { queuePopService } from "./redis-queue-pop-service";
import { RedisWorkerTimer } from "./redis-worker-timer";

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
