import type Redis from "ioredis";

import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { ClaimLockManager } from "./claim-lock-manager";
import { TopicClaimScanner } from "./topic-claim-scanner";

export class ClaimExecutor {
	private readonly _lockManager: ClaimLockManager;
	private readonly _topicScanner: TopicClaimScanner;

	constructor(private readonly _prefix: string) {
		this._lockManager = new ClaimLockManager(this._prefix);
		this._topicScanner = new TopicClaimScanner(this._prefix);
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		return this._doClaimPendingMessages(
			groupName,
			consumerId,
			minIdleMs,
			count
		);
	}

	async claimEntriesForRetry(options: {
		groupName: string;
		consumerId: string;
		minIdleMs?: number;
		count?: number;
	}): Promise<number> {
		return this._doClaimPendingMessages(
			options.groupName,
			options.consumerId,
			options.minIdleMs ?? 60_000,
			options.count ?? 100
		);
	}

	private async _doClaimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs: number,
		count: number
	): Promise<number> {
		let redis: Redis | null = null;
		try {
			redis = await getStreamClient();
			return await this._executeClaim(redis, groupName, consumerId, minIdleMs, count);
		} catch (err) {
			logger.warn("Failed to claim pending messages", {
				context: {
					error: (err as Error).message,
				},
			});
			return 0;
		} finally {
			if (redis) {
				await this._lockManager.release(redis, consumerId);
			}
		}
	}

	private async _executeClaim(
		redis: Redis,
		groupName: string,
		consumerId: string,
		minIdleMs: number,
		count: number
	): Promise<number> {
		const acquired = await this._lockManager.acquire(redis, consumerId);
		if (!acquired) {
			return 0;
		}
		const topics = await this._topicScanner.scan(redis);
		let total = 0;

		for (const topic of topics) {
			total += await this._topicScanner.claimForTopic(redis, topic, {
				groupName,
				consumerId,
				minIdleMs,
				count,
			});
		}

		if (total > 0) {
			logger.info(
				`Claimed ${total} pending messages for ${consumerId} across ${topics.length} topics`
			);
		}
		return total;
	}
}
