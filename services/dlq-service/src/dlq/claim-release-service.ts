import { toInstanceId } from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import { logger } from "../config/logger";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqClaimManager } from "./claim-manager";
import { dlqRepository } from "./repository";

export class ClaimReleaseService {
	async releaseAndRequeue(): Promise<void> {
		const releasedCount = await dlqClaimManager.releaseClaimsByInstance(
			toInstanceId(ENV.INSTANCE_ID)
		);
		if (releasedCount > 0 && dlqRedisQueue.isAvailable()) {
			await this._requeueReleased(releasedCount);
		}
	}

	async releaseStale(staleThresholdMs?: number): Promise<void> {
		const released = await dlqClaimManager.releaseStaleClaims(staleThresholdMs);
		if (released > 0) {
			logger.info(`Released ${released} stale claims from previous instance`);
		}
	}

	private async _requeueReleased(releasedCount: number): Promise<void> {
		const toPush = await this._computeBatch(releasedCount);
		for (const id of toPush) {
			dlqRedisQueue.push(id).catch(() => {});
		}
		logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
	}

	private async _computeBatch(releasedCount: number): Promise<string[]> {
		const allQueuable = await dlqRepository.listQueuable();
		const uniqueIds = [...new Set(allQueuable)];
		return uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
	}
}
