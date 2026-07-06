import { randomUUID } from "node:crypto";

import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";

import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";

export interface SubscriptionEntry {
	id: string;
	topic: string;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
	createdAt: string;
}

const SUBSCRIPTION_TTL_MS = 30_000;

export class SubscriptionRedisStore {
	private _keys: RedisSubscriptionKeys;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
	}

	async add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._keys.subKey(topic, serviceIdentity.instanceId);
		const exists = await redis.exists(subKey);
		if (exists) {
			return;
		}

		const entry: SubscriptionEntry = {
			id: randomUUID(),
			topic,
			callbackPath,
			serviceIdentity,
			createdAt: new Date().toISOString(),
		};

		const multi = redis.multi();
		multi.hset(subKey, "data", JSON.stringify(entry));
		multi.expire(subKey, Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
		multi.sadd(this._keys.topicKey(topic), serviceIdentity.instanceId);
		multi.sadd(this._keys.instanceKey(serviceIdentity.instanceId), topic);
		multi.sadd(this._keys.topicsSetKey(), topic);
		multi.sadd(this._keys.activeInstancesKey(), serviceIdentity.instanceId);
		multi.hset(
			this._keys.leaseKey(serviceIdentity.instanceId),
			topic,
			Date.now().toString()
		);
		multi.expire(
			this._keys.leaseKey(serviceIdentity.instanceId),
			Math.ceil(SUBSCRIPTION_TTL_MS / 1000)
		);
		await multi.exec();
	}

	async remove(topic: string, instanceId: string): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._keys.subKey(topic, instanceId);
		const multi = this._buildRemovePipeline(redis, topic, instanceId, subKey);
		const results = await multi.exec();
		if (!results) {
			return;
		}
		this._cleanupInstanceIfEmpty(redis, results, instanceId);
		this._cleanupTopicIfEmpty(redis, results, topic);
	}

	private _buildRemovePipeline(
		redis: import("ioredis").Redis,
		topic: string,
		instanceId: string,
		subKey: string
	): ReturnType<import("ioredis").Redis["multi"]> {
		const multi = redis.multi();
		multi.del(subKey);
		multi.srem(this._keys.topicKey(topic), instanceId);
		multi.srem(this._keys.instanceKey(instanceId), topic);
		multi.hdel(this._keys.leaseKey(instanceId), topic);
		multi.scard(this._keys.instanceKey(instanceId));
		multi.scard(this._keys.topicKey(topic));
		return multi;
	}

	private async _cleanupInstanceIfEmpty(
		redis: import("ioredis").Redis,
		results: [Error | null, unknown][],
		instanceId: string
	): Promise<void> {
		const instanceScard = results[results.length - 2];
		if (this._isZeroScardResult(instanceScard)) {
			try {
				await redis.srem(this._keys.activeInstancesKey(), instanceId);
			} catch {
				/* best-effort */
			}
		}
	}

	private async _cleanupTopicIfEmpty(
		redis: import("ioredis").Redis,
		results: [Error | null, unknown][],
		topic: string
	): Promise<void> {
		const scardResult = results[results.length - 1];
		if (this._isZeroScardResult(scardResult)) {
			try {
				await redis.srem(this._keys.topicsSetKey(), topic);
			} catch {
				// best-effort
			}
		}
	}

	private _isZeroScardResult(
		result: [Error | null, unknown]
	): boolean {
		return result[0] === null && typeof result[1] === "number" && (result[1] as number) === 0;
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

	private async _fetchSubsBatch(
		redis: import("ioredis").Redis,
		topic: string,
		instanceIds: string[]
	): Promise<[Error | null, unknown][] | null> {
		const pipeline = redis.pipeline();
		for (const id of instanceIds) {
			pipeline.hget(this._keys.subKey(topic, id), "data");
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
				logger.warn("Failed to parse subscription entry", { context: {
					error: normalizeError(parseErr as Error),
				} });
			}
		}
		return entries;
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
