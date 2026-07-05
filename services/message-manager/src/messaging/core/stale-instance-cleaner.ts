import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";

const HEARTBEAT_INTERVAL_MS = ENV.STALE_HEARTBEAT_INTERVAL_MS;
const MISSED_HEARTBEAT_THRESHOLD = ENV.STALE_MISSED_HEARTBEAT_THRESHOLD;
const GRACE_PERIOD_MS = ENV.STALE_GRACE_PERIOD_MS;

export class StaleInstanceCleaner {
	constructor(private readonly _prefix: string) {}

	private _subKey(topic: string, instanceId: string): string {
		return `${this._prefix}sub:${topic}:${instanceId}`;
	}

	private _topicKey(topic: string): string {
		return `${this._prefix}sub:${topic}`;
	}

	private _instanceKey(instanceId: string): string {
		return `${this._prefix}instance:${instanceId}`;
	}

	private _topicsSetKey(): string {
		return `${this._prefix}topics`;
	}

	private _activeInstancesKey(): string {
		return `${this._prefix}active-instances`;
	}

	async isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		const redis = await getSubscriptionClient();
		const leaseKey = `${this._prefix}lease:${instanceId}`;
		const heartbeat = await redis.hget(leaseKey, "heartbeat");
		if (!heartbeat) {
			return true;
		}
		const lastBeat = Number.parseInt(heartbeat, 10);
		const elapsed = Date.now() - lastBeat;
		if (elapsed <= HEARTBEAT_INTERVAL_MS * MISSED_HEARTBEAT_THRESHOLD) {
			return false;
		}
		if (elapsed < GRACE_PERIOD_MS) {
			return false;
		}
		return true;
	}

	private async _isInstanceStale(
		redis: Redis,
		instanceId: string
	): Promise<boolean> {
		const leaseKey = `${this._prefix}lease:${instanceId}`;
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
		const leaseKey = `${this._prefix}lease:${instanceId}`;
		const topics = await redis.hkeys(leaseKey);
		const multi = redis.multi();
		for (const topic of topics) {
			if (topic === "heartbeat") {
				continue;
			}
			multi.del(this._subKey(topic, instanceId));
			multi.srem(this._topicKey(topic), instanceId);
		}
		multi.del(leaseKey);
		multi.del(this._instanceKey(instanceId));
		multi.srem(this._activeInstancesKey(), instanceId);
		await multi.exec();
		return topics;
	}

	private async _cleanupOrphanedTopics(
		redis: Redis,
		topics: string[]
	): Promise<void> {
		for (const topic of topics) {
			if (topic === "heartbeat") {
				continue;
			}
			try {
				const remaining = await redis.scard(this._topicKey(topic));
				if (remaining === 0) {
					await redis.srem(this._topicsSetKey(), topic);
				}
			} catch {
				/* best-effort */
			}
		}
	}

	async removeStaleInstances(): Promise<number> {
		const redis = await getSubscriptionClient();
		let removed = 0;
		let scanCursor = "0";

		do {
			const [nextCursor, instanceIds] = await redis.sscan(
				this._activeInstancesKey(),
				scanCursor,
				"COUNT",
				100
			);
			scanCursor = nextCursor;

			for (const instanceId of instanceIds) {
				if (!(await this._isInstanceStale(redis, instanceId))) {
					continue;
				}
				const topics = await this._removeInstanceSubscriptions(
					redis,
					instanceId
				);
				await this._cleanupOrphanedTopics(redis, topics);
				removed += topics.length;
				logger.info("Removed stale subscription by heartbeat", {
					instanceId,
					topics: topics.join(","),
				});
			}
		} while (scanCursor !== "0");

		return removed;
	}
}
