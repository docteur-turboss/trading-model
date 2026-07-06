import type Redis from "ioredis";

import { LEASE_HEARTBEAT_FIELD } from "./subscription-store";

export class StaleInstanceRemover {
	constructor(private readonly _prefix: string) {}

	async removeSubscriptions(
		redis: Redis,
		instanceId: string
	): Promise<string[]> {
		const leaseKey = `${this._prefix}lease:${instanceId}`;
		const topics = await redis.hkeys(leaseKey);
		const multi = redis.multi();
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			multi.del(`${this._prefix}sub:${topic}:${instanceId}`);
			multi.srem(`${this._prefix}sub:${topic}`, instanceId);
		}
		multi.del(leaseKey);
		multi.del(`${this._prefix}instance:${instanceId}`);
		multi.srem(`${this._prefix}active-instances`, instanceId);
		await multi.exec();
		return topics;
	}

	async cleanupOrphanedTopics(redis: Redis, topics: string[]): Promise<void> {
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			try {
				const remaining = await redis.scard(`${this._prefix}sub:${topic}`);
				if (remaining === 0) {
					await redis.srem(`${this._prefix}topics`, topic);
				}
			} catch {
				/* best-effort */
			}
		}
	}
}
