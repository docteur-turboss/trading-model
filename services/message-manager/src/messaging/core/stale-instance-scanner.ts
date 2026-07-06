import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getSubscriptionClient } from "../../config/redis";
import { LEASE_HEARTBEAT_FIELD } from "./subscription-store";
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

	constructor(private readonly _prefix: string) {
		this._remover = new StaleInstanceRemover(this._prefix);
	}

	async isStaleByHeartbeat(instanceId: string): Promise<boolean> {
		const redis = await getSubscriptionClient();
		const heartbeat = await redis.hget(
			`${this._prefix}lease:${instanceId}`,
			LEASE_HEARTBEAT_FIELD
		);
		if (!heartbeat) {
			return true;
		}
		return isHeartbeatExpired(Number.parseInt(heartbeat, 10));
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
			`${this._prefix}active-instances`,
			cursor,
			"COUNT",
			100
		);
		let removed = 0;
		for (const instanceId of instanceIds) {
			if (!(await this._isInstanceStale(redis, instanceId))) {
				continue;
			}
			const topics = await this._remover.removeSubscriptions(redis, instanceId);
			await this._remover.cleanupOrphanedTopics(redis, topics);
			removed += topics.length;
			logger.info("Removed stale subscription by heartbeat", {
				instanceId,
				topics: topics.join(","),
			});
		}
		return { cursor: nextCursor, removed };
	}
}
