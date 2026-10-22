import { logger } from "../../config/logger";
import type {
	ClaimReleasePort,
	DlqReplaySettings,
	QueuableEntriesPort,
	ReplayQueuePort,
} from "../../domain/ports/replay.ports";

export interface ClaimReleaseServiceDeps {
	claimRelease: ClaimReleasePort;
	entries: QueuableEntriesPort;
	queue: ReplayQueuePort;
	settings: DlqReplaySettings;
}

export class ClaimReleaseService {
	constructor(private readonly _deps: ClaimReleaseServiceDeps) {}

	async releaseAndRequeue(): Promise<void> {
		const releasedCount = await this._deps.claimRelease.releaseClaimsByInstance(
			this._deps.settings.instanceId
		);
		if (releasedCount > 0 && this._deps.queue.isAvailable()) {
			await this._requeueReleased(releasedCount);
		}
	}

	async releaseStale(staleThresholdMs?: number): Promise<void> {
		const released =
			await this._deps.claimRelease.releaseStaleClaims(staleThresholdMs);
		if (released > 0) {
			logger.info(`Released ${released} stale claims from previous instance`);
		}
	}

	private async _requeueReleased(releasedCount: number): Promise<void> {
		const toPush = await this._computeBatch(releasedCount);
		for (const id of toPush) {
			this._deps.queue.push(id).catch(() => {});
		}
		logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
	}

	private async _computeBatch(releasedCount: number): Promise<string[]> {
		const allQueuable = await this._deps.entries.listQueuable();
		const uniqueIds = [...new Set(allQueuable)];
		return uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
	}
}
