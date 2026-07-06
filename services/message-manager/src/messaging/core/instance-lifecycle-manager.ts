import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";

const SUBSCRIPTION_TTL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = ENV.STALE_HEARTBEAT_INTERVAL_MS;
const MISSED_HEARTBEAT_THRESHOLD = ENV.STALE_MISSED_HEARTBEAT_THRESHOLD;
const GRACE_PERIOD_MS = ENV.STALE_GRACE_PERIOD_MS;

export const LEASE_HEARTBEAT_FIELD = "heartbeat";

function isHeartbeatExpired(lastBeat: number): boolean {
	const elapsed = Date.now() - lastBeat;
	if (elapsed <= HEARTBEAT_INTERVAL_MS * MISSED_HEARTBEAT_THRESHOLD) {
		return false;
	}
	if (elapsed < GRACE_PERIOD_MS) {
		return false;
	}
	return true;
}

export class InstanceLifecycleManager {
	private _keys: RedisSubscriptionKeys;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
	}

	async heartbeat(instanceId: string): Promise<void> {
		const redis = await getSubscriptionClient();
		const leaseKey = this._keys.leaseKey(instanceId);
		await redis.hset(leaseKey, LEASE_HEARTBEAT_FIELD, Date.now().toString());
		await redis.expire(leaseKey, Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
	}

	async isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		const redis = await getSubscriptionClient();
		const heartbeat = await redis.hget(
			this._keys.leaseKey(instanceId),
			LEASE_HEARTBEAT_FIELD
		);
		if (!heartbeat) {
			return true;
		}
		return isHeartbeatExpired(Number.parseInt(heartbeat, 10));
	}

	async renewLease(instanceId: string, topics: string[]): Promise<void> {
		if (topics.length === 0) {
			return;
		}
		const redis = await getSubscriptionClient();
		const multi = redis.multi();
		const now = Date.now().toString();
		for (const topic of topics) {
			this._addRenewCommands(multi, instanceId, topic, now);
		}
		await multi.exec();
	}

	private _addRenewCommands(
		multi: ReturnType<import("ioredis").Redis["multi"]>,
		instanceId: string,
		topic: string,
		now: string
	): void {
		multi.hset(this._keys.leaseKey(instanceId), topic, now);
		multi.hset(this._keys.leaseKey(instanceId), LEASE_HEARTBEAT_FIELD, now);
		multi.expire(this._keys.leaseKey(instanceId), Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
		multi.expire(this._keys.subKey(topic, instanceId), Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
	}

	async removeStaleInstances(): Promise<number> {
		const redis = await getSubscriptionClient();
		let totalRemoved = 0;
		let cursor = "0";

		do {
			const result = await this._scanAndRemoveStale(redis, cursor);
			cursor = result.cursor;
			totalRemoved += result.removed;
		} while (cursor !== "0");

		return totalRemoved;
	}

	private async _scanAndRemoveStale(
		redis: Redis,
		cursor: string
	): Promise<{ cursor: string; removed: number }> {
		const [nextCursor, instanceIds] = await redis.sscan(
			this._keys.activeInstancesKey(),
			cursor,
			"COUNT",
			100
		);
		let removed = 0;
		for (const instanceId of instanceIds) {
			if (!(await this._isInstanceStale(redis, instanceId))) {
				continue;
			}
			const topics = await this._removeInstanceSubscriptions(redis, instanceId);
			await this._cleanupOrphanedTopics(redis, topics);
			removed += topics.length;
			logger.info("Removed stale subscription by heartbeat", { instanceId, topics: topics.join(",") });
		}
		return { cursor: nextCursor, removed };
	}

	private async _isInstanceStale(
		redis: Redis,
		instanceId: string
	): Promise<boolean> {
		const leaseKey = this._keys.leaseKey(instanceId);
		const ttl = await redis.ttl(leaseKey);
		if (ttl > 0) {
			return false;
		}
		return this.isStaleByHeartbeat(instanceId);
	}

	private async _removeInstanceSubscriptions(
		redis: Redis,
		instanceId: string
	): Promise<string[]> {
		const leaseKey = this._keys.leaseKey(instanceId);
		const topics = await redis.hkeys(leaseKey);
		const multi = redis.multi();
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			multi.del(this._keys.subKey(topic, instanceId));
			multi.srem(this._keys.topicKey(topic), instanceId);
		}
		multi.del(leaseKey);
		multi.del(this._keys.instanceKey(instanceId));
		multi.srem(this._keys.activeInstancesKey(), instanceId);
		await multi.exec();
		return topics;
	}

	private async _cleanupOrphanedTopics(
		redis: Redis,
		topics: string[]
	): Promise<void> {
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			try {
				const remaining = await redis.scard(this._keys.topicKey(topic));
				if (remaining === 0) {
					await redis.srem(this._keys.topicsSetKey(), topic);
				}
			} catch {
				/* best-effort */
			}
		}
	}
}
