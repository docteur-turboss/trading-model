import type { Topic } from "@trading-model/common/domain/primitives";
import type Redis from "ioredis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";

import type { ClaimParams } from "./messaging-types";

export class TopicClaimScanner {
	constructor(private readonly _keys: RedisKeyBuilder) {}

	async scan(redis: Redis): Promise<string[]> {
		const topics: Topic[] = [];
		let cursor = "0";
		do {
			cursor = await this._scanPage(redis, cursor, topics);
		} while (cursor !== "0");
		return topics;
	}

	async claimForTopic(
		redis: Redis,
		topic: Topic,
		claimOpts: Required<ClaimParams>
	): Promise<number> {
		const { groupName, consumerId, minIdleMs, count } = claimOpts;
		const streamKey = this._keys.key("stream", topic);
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

	private async _scanPage(
		redis: Redis,
		cursor: string,
		topics: Topic[]
	): Promise<string> {
		const [nextCursor, batch] = await redis.sscan(
			this._keys.key("topics"),
			cursor,
			"COUNT",
			100
		);
		topics.push(...batch);
		return nextCursor;
	}
}
