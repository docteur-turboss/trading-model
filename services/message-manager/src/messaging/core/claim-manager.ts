import type Redis from "ioredis";

import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

export class ClaimManager {
	constructor(private readonly _prefix: string) {}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	private async _acquireClaimLock(
		redis: Redis,
		consumerId: string,
		lockKey: string
	): Promise<boolean> {
		const acquired = await redis.set(lockKey, consumerId, "EX", 30, "NX");
		if (!acquired) {
			logger.info(
				"claimPendingMessages: lock held by another instance — skipping"
			);
			return false;
		}
		return true;
	}

	private async _scanClaimTopics(redis: Redis): Promise<string[]> {
		const topics: string[] = [];
		let cursor = "0";
		do {
			const [nextCursor, batch] = await redis.sscan(
				`${this._prefix}topics`,
				cursor,
				"COUNT",
				100
			);
			cursor = nextCursor;
			topics.push(...batch);
		} while (cursor !== "0");
		return topics;
	}

	private async _claimForTopic(
		redis: Redis,
		topic: string,
		groupName: string,
		consumerId: string,
		minIdleMs: number,
		count: number
	): Promise<number> {
		const streamKey = this._streamKey(topic);
		try {
			const pending = await redis.xpending(
				streamKey,
				groupName,
				"-",
				"+",
				count,
				consumerId
			);
			const pendingEntries = pending as [string, string, number, number][];
			const claimable = pendingEntries
				.filter(([, , , idleMs]) => idleMs >= minIdleMs)
				.map(([id]) => id);

			if (claimable.length > 0) {
				const claimed = await redis.xclaim(
					streamKey,
					groupName,
					consumerId,
					minIdleMs,
					...claimable
				);
				return (claimed as unknown[]).length;
			}
			return 0;
		} catch {
			return 0;
		}
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		const lockKey = `${this._prefix}claim-lock`;
		let redis: Redis | null = null;
		try {
			redis = await getStreamClient();
			const acquired = await this._acquireClaimLock(redis, consumerId, lockKey);
			if (!acquired) {
				return 0;
			}
			const topics = await this._scanClaimTopics(redis);
			let total = 0;

			for (const topic of topics) {
				total += await this._claimForTopic(
					redis,
					topic,
					groupName,
					consumerId,
					minIdleMs,
					count
				);
			}

			if (total > 0) {
				logger.info(
					`Claimed ${total} pending messages for ${consumerId} across ${topics.length} topics`
				);
			}
			return total;
		} catch (err) {
			logger.warn("Failed to claim pending messages", {
				error: (err as Error).message,
			});
			return 0;
		} finally {
			if (redis) {
				try {
					await redis.eval(
						"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
						1,
						lockKey,
						consumerId
					);
				} catch {
					/* best-effort */
				}
			}
		}
	}
}
