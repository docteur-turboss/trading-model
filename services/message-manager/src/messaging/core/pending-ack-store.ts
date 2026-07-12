import type { InstanceId } from "@trading-model/common/domain/primitives";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { PendingAckData } from "./messaging-types";
import { StaleEntryScanner } from "./stale-entry-scanner";

export class PendingAckStore {
	private readonly _keys: RedisKeyBuilder;
	private readonly _staleScanner = new StaleEntryScanner();

	constructor(keys: RedisKeyBuilder) {
		this._keys = keys;
	}

	private _pendingKey(instanceId: InstanceId): string {
		return this._keys.key("pending", instanceId);
	}

	async add(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		const redis = await getStreamClient();
		await redis.hset(
			this._pendingKey(instanceId),
			messageId,
			JSON.stringify({ ...data, pendingAt: Date.now() })
		);
		await redis.expire(this._pendingKey(instanceId), ENV.REDIS_MESSAGE_TTL_S);
	}

	async remove(instanceId: InstanceId, messageId: string): Promise<void> {
		const redis = await getStreamClient();
		await redis.hdel(this._pendingKey(instanceId), messageId);
	}

	async getAll(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>> {
		const redis = await getStreamClient();
		const result: Record<string, PendingAckData> = {};
		let cursor = "0";
		do {
			cursor = await this._scanPendingBatch(redis, instanceId, cursor, result);
		} while (cursor !== "0");
		return result;
	}

	private async _scanPendingBatch(
		redis: import("ioredis").Redis,
		instanceId: InstanceId,
		cursor: string,
		result: Record<string, PendingAckData>
	): Promise<string> {
		const [nextCursor, batch] = await redis.hscan(
			this._pendingKey(instanceId),
			cursor,
			"COUNT",
			200
		);
		for (let i = 0; i < batch.length; i += 2) {
			try {
				result[batch[i]] = JSON.parse(batch[i + 1]);
			} catch {}
		}
		return nextCursor;
	}

	async recoverStale(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		try {
			return await this._doRecoverStale(ownInstanceId, maxAgeMs);
		} catch (err) {
			logger.warn("Failed to recover pending acks", {
				context: { error: (err as Error).message },
			});
			return 0;
		}
	}

	private async _doRecoverStale(
		ownInstanceId: string,
		maxAgeMs: number
	): Promise<number> {
		const redis = await getStreamClient();
		const pendingKey = this._pendingKey(ownInstanceId);
		const now = Date.now();

		const staleIds = await this._staleScanner.scan(
			redis,
			pendingKey,
			now,
			maxAgeMs
		);

		if (staleIds.length > 0) {
			await redis.hdel(pendingKey, ...staleIds);
			logger.info(
				`Recovered ${staleIds.length} stale pending acks for instance ${ownInstanceId}`
			);
		}
		return staleIds.length;
	}
}
