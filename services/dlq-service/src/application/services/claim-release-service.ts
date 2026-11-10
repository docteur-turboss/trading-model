import { logger } from "@trading-model/http/infrastructure/logger";
import type {
	ClaimReleasePort,
	DlqReplaySettings,
	QueuableEntriesPort,
	ReplayQueuePort,
} from "../../domain/ports/replay.port";

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
		const results = await Promise.all(
			toPush.map((id) => this._deps.queue.push(id))
		);
		const queued = results.filter(Boolean).length;
		logger.info(`Re-queued ${queued}/${toPush.length} entries after shutdown`);
		if (queued < toPush.length) {
			logger.warn(
				`${toPush.length - queued} released entries were not re-queued; they stay queuable in MongoDB until the next queue rebuild`
			);
		}
	}

	private async _computeBatch(releasedCount: number): Promise<string[]> {
		const allQueuable = await this._deps.entries.listQueuable();
		const uniqueIds = [...new Set(allQueuable)];
		return uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
	}
}
