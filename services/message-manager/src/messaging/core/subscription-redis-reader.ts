import { toInstanceId, toTopic } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";

import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";
import type { SubscriptionEntry } from "./subscription-redis-store";

export class SubscriptionRedisReader {
	private _keys: RedisSubscriptionKeys;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
	}

	async getByTopic(topic: string): Promise<SubscriptionEntry[]> {
		const redis = await getSubscriptionClient();
		const instanceIds = await redis.smembers(this._keys.topicKey(topic));
		if (instanceIds.length === 0) {
			return [];
		}

		const results = await this._fetchSubsBatch(redis, topic, instanceIds);
		if (!results) {
			return [];
		}

		return this._parseSubsResults(results);
	}

	async getTopicsByInstance(instanceId: string): Promise<string[]> {
		const redis = await getSubscriptionClient();
		return redis.smembers(this._keys.instanceKey(instanceId));
	}

	async getAllTopics(): Promise<string[]> {
		const redis = await getSubscriptionClient();
		const topics: string[] = [];
		let cursor = "0";
		do {
			cursor = await this._scanTopicPage(redis, cursor, topics);
		} while (cursor !== "0");
		return topics;
	}

	private async _fetchSubsBatch(
		redis: import("ioredis").Redis,
		topic: string,
		instanceIds: string[]
	): Promise<[Error | null, unknown][] | null> {
		const pipeline = redis.pipeline();
		for (const id of instanceIds) {
			pipeline.hget(
				this._keys.subKey({
					topic: toTopic(topic),
					instanceId: toInstanceId(id),
				}),
				"data"
			);
		}
		return await pipeline.exec();
	}

	private _parseSubsResults(
		results: [Error | null, unknown][]
	): SubscriptionEntry[] {
		const entries: SubscriptionEntry[] = [];
		for (const [err, data] of results) {
			if (err || !data) {
				continue;
			}
			try {
				const entry = JSON.parse(data as string) as SubscriptionEntry;
				entries.push(entry);
			} catch (parseErr) {
				logger.warn("Failed to parse subscription entry", {
					context: {
						error: normalizeError(parseErr as Error),
					},
				});
			}
		}
		return entries;
	}

	private async _scanTopicPage(
		redis: import("ioredis").Redis,
		cursor: string,
		topics: string[]
	): Promise<string> {
		const [nextCursor, batch] = await redis.sscan(
			this._keys.topicsSetKey(),
			cursor,
			"COUNT",
			100
		);
		topics.push(...batch);
		return nextCursor;
	}
}
