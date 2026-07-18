import { randomUUID } from "node:crypto";

import {
	toInstanceId,
	toMessageId,
	type URLString,
} from "@trading-model/common/domain/primitives";
import { ObjectId } from "mongodb";
import { ENV } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { handleAbandonedEntries } from "./auto-retry";
import { dlqClaimManager } from "./claim-manager";
import { doReplayBatch } from "./replay-pipeline";
import { isShuttingDown } from "./shared/shutdown-flag";

export class ClaimReplayOrchestrator {
	async claimAndReplay(
		entryIds: string[],
		messageManagerUrl: URLString
	): Promise<void> {
		const batchId = `redis-${Date.now()}-${randomUUID().slice(0, 8)}`;
		const entries = await this._claimBatch(entryIds, batchId);
		if (!entries || entries.length === 0) {
			return;
		}
		await this._executeReplay(entries, messageManagerUrl, batchId);
	}

	private async _claimBatch(
		entryIds: string[],
		batchId: string
	): Promise<Array<{ id: string; message: unknown }> | null> {
		const validIds = entryIds.filter((id) => ObjectId.isValid(id));
		if (validIds.length === 0) {
			return null;
		}

		const claimed = await dlqClaimManager.claimEntriesByIds(validIds, {
			batchId,
			instanceId: toInstanceId(ENV.INSTANCE_ID),
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
			void dlqRedisQueue.push(remaining);
		}
	}

	private async _executeReplay(
		entries: Array<{ id: string; message: unknown }>,
		messageManagerUrl: URLString,
		batchId: string
	): Promise<void> {
		logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
		const { success, errors } = await doReplayBatch({
			entries: entries.map((entry) => ({
				id: toMessageId(entry.id),
				message: entry.message,
			})),
			messageManagerUrl,
			batchId,
			instanceId: toInstanceId(ENV.INSTANCE_ID),
		});

		if (success > 0) {
			metrics.entriesReplayed.inc(success);
		}
		if (errors.length > 0) {
			metrics.entriesReplayFailed.inc(errors.length);
		}

		if (errors.length > 0) {
			await handleAbandonedEntries("DLQ Redis queue");
		}

		logger.info(
			`DLQ Redis queue: ${success} replayed, ${errors.length} failed`
		);
	}
}

export const claimReplayOrchestrator = new ClaimReplayOrchestrator();
