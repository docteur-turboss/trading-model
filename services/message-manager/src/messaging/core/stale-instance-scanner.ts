import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type Redis from "ioredis";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import { StaleInstanceRemover } from "./stale-instance-remover";

const HEARTBEAT_INTERVAL_MS = ENV.STALE_HEARTBEAT_INTERVAL_MS;
const MISSED_HEARTBEAT_THRESHOLD = ENV.STALE_MISSED_HEARTBEAT_THRESHOLD;
const GRACE_PERIOD_MS = ENV.STALE_GRACE_PERIOD_MS;

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

export class StaleInstanceScanner {
	private readonly _remover: StaleInstanceRemover;

	constructor(private readonly _keys: RedisKeyBuilder) {
		this._remover = new StaleInstanceRemover(this._keys);
	}

	async isStaleByHeartbeat(instanceId: InstanceId): Promise<boolean> {
		const redis = await getSubscriptionClient();
		const heartbeat = await redis.hget(
			this._keys.key("lease", instanceId),
			LEASE_HEARTBEAT_FIELD
		);
		if (!heartbeat) {
			return true;
		}
		return isHeartbeatExpired(Number.parseInt(heartbeat, 10));
	}

	private async _isInstanceStale(
		redis: Redis,
		instanceId: InstanceId
	): Promise<boolean> {
		const leaseKey = this._keys.key("lease", instanceId);
		const ttl = await redis.ttl(leaseKey);
		if (ttl > 0) {
			return false;
		}
		return this.isStaleByHeartbeat(instanceId);
	}

	async removeStaleInstances(): Promise<number> {
		const redis = await getSubscriptionClient();
		let totalRemoved = 0;
		let cursor = "0";

		do {
			const result = await this._scanAndRemove(redis, cursor);
			cursor = result.cursor;
			totalRemoved += result.removed;
		} while (cursor !== "0");

		return totalRemoved;
	}

	private async _scanAndRemove(
		redis: import("ioredis").Redis,
		cursor: string
	): Promise<{ cursor: string; removed: number }> {
		const [nextCursor, instanceIds] = await redis.sscan(
			this._keys.key("active-instances"),
			cursor,
			"COUNT",
			100
		);
		const removed = await this._processStaleInstances(redis, instanceIds);
		return { cursor: nextCursor, removed };
	}

	private async _processStaleInstances(
		redis: import("ioredis").Redis,
		instanceIds: string[]
	): Promise<number> {
		let removed = 0;
		for (const instanceId of instanceIds) {
			if (!(await this._isInstanceStale(redis, instanceId as InstanceId))) {
				continue;
			}
			removed += await this._removeStaleInstance(
				redis,
				instanceId as InstanceId
			);
		}
		return removed;
	}

	private async _removeStaleInstance(
		redis: import("ioredis").Redis,
		instanceId: InstanceId
	): Promise<number> {
		const topics = await this._remover.removeSubscriptions(redis, instanceId);
		await this._remover.cleanupOrphanedTopics(redis, topics as Topic[]);
		logger.info("Removed stale subscription by heartbeat", {
			instanceId,
			topics: topics.join(","),
		});
		return topics.length;
	}
}
