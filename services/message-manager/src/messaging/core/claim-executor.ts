import {
	DurationMs,
	type PositiveInt,
	type Topic,
} from "@trading-model/common/domain/primitives";
import type Redis from "ioredis";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { ClaimLockManager } from "./claim-lock-manager";
import type { IClaimOps } from "./claim-ops-interface";
import type { ClaimParams } from "./messaging-types";
import { TopicClaimScanner } from "./topic-claim-scanner";

export class ClaimExecutor implements IClaimOps {
	private readonly _lockManager: ClaimLockManager;
	private readonly _topicScanner: TopicClaimScanner;

	constructor(private readonly _keys: RedisKeyBuilder) {
		this._lockManager = new ClaimLockManager(this._keys);
		this._topicScanner = new TopicClaimScanner(this._keys);
	}

	claimPendingMessages(params: ClaimParams): Promise<number> {
		return this._doClaimPendingMessages({
			groupName: params.groupName,
			consumerId: params.consumerId,
			minIdleMs: params.minIdleMs ?? DurationMs.of(60_000),
			count: params.count ?? (100 as PositiveInt),
		});
	}

	private async _doClaimPendingMessages(
		params: Required<ClaimParams>
	): Promise<number> {
		let redis: Redis | null = null;
		try {
			redis = await getStreamClient();
			return await this._executeClaim(redis, params);
		} catch (err) {
			logger.warn("Failed to claim pending messages", {
				context: {
					error: (err as Error).message,
				},
			});
			return 0;
		} finally {
			if (redis) {
				await this._lockManager.release(redis, params.consumerId);
			}
		}
	}

	private async _executeClaim(
		redis: Redis,
		params: Required<ClaimParams>
	): Promise<number> {
		const acquired = await this._lockManager.acquire(redis, params.consumerId);
		if (!acquired) {
			return 0;
		}
		const topics = await this._topicScanner.scan(redis);
		let total = 0;

		for (const topic of topics) {
			total += await this._topicScanner.claimForTopic(
				redis,
				topic as Topic,
				params
			);
		}

		if (total > 0) {
			logger.info(
				`Claimed ${total} pending messages for ${params.consumerId} across ${topics.length} topics`
			);
		}
		return total;
	}
}
