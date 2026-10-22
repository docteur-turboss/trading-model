import {
	toMessageId,
	type URLString,
} from "@trading-model/primitives/primitives";
import { logger } from "../../config/logger";
import { metrics } from "../../config/metrics";
import type {
	ClaimedEntry,
	DlqReplaySettings,
	EntryClaimPort,
	ReplayQueuePort,
} from "../../domain/ports/replay.ports";
import { generateBatchId } from "../../shared/batch-id";
import { isShuttingDown } from "../../shared/shutdown-flag";
import type { BatchResults, ReplayBatchOptions } from "../../shared/types";

export interface ClaimReplayOrchestratorDeps {
	claims: EntryClaimPort;
	queue: ReplayQueuePort;
	replayBatch(options: ReplayBatchOptions): Promise<BatchResults>;
	handleAbandonedEntries(source: string): Promise<void>;
	settings: DlqReplaySettings;
}

/** Replays the entries popped from the Redis queue. */
export class ClaimReplayOrchestrator {
	constructor(private readonly _deps: ClaimReplayOrchestratorDeps) {}

	async claimAndReplay(
		entryIds: string[],
		messageManagerUrl: URLString
	): Promise<void> {
		const batchId = generateBatchId("redis");
		const entries = await this._claimBatch(entryIds, batchId);
		if (!entries || entries.length === 0) {
			return;
		}
		await this._executeReplay(entries, messageManagerUrl, batchId);
	}

	private async _claimBatch(
		entryIds: string[],
		batchId: string
	): Promise<ClaimedEntry[] | null> {
		// Malformed ids are filtered by the claim adapter (ObjectId validation).
		const claimed = await this._deps.claims.claimEntriesByIds(entryIds, {
			batchId,
			instanceId: this._deps.settings.instanceId,
		});
		if (claimed.length === 0) {
			return null;
		}

		if (isShuttingDown()) {
			this._requeueRemaining(entryIds);
			return null;
		}

		return claimed.map((entry) => ({ id: entry.id, message: entry.message }));
	}

	private _requeueRemaining(entryIds: string[]): void {
		for (const remaining of entryIds) {
			void this._deps.queue.push(remaining);
		}
	}

	private async _executeReplay(
		entries: ClaimedEntry[],
		messageManagerUrl: URLString,
		batchId: string
	): Promise<void> {
		logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
		const { success, errors } = await this._deps.replayBatch({
			entries: entries.map((entry) => ({
				id: toMessageId(entry.id),
				message: entry.message,
			})),
			messageManagerUrl,
			batchId,
			instanceId: this._deps.settings.instanceId,
		});

		if (success > 0) {
			metrics.entriesReplayed.inc(success);
		}
		if (errors.length > 0) {
			metrics.entriesReplayFailed.inc(errors.length);
			await this._deps.handleAbandonedEntries("DLQ Redis queue");
		}

		logger.info(
			`DLQ Redis queue: ${success} replayed, ${errors.length} failed`
		);
	}
}
