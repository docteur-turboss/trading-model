import { retryWithBackoff } from "@trading-model/common/utils/retry";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

const MAX_WAL_RETRY = 10;
const STORE_OPERATION_TIMEOUT_MS = 15_000;

export class RedisStreamStore {
	constructor(private readonly _prefix: string) {}

	async store(topic: string, serialized: string): Promise<string | null> {
		const redis = await getStreamClient();
		const { result: entryId, lastError } = await retryWithBackoff(
			() => this._tryStoreOnce(topic, serialized, redis),
			{
				maxRetries: MAX_WAL_RETRY,
				baseDelayMs: 100,
				maxDelayMs: 5000,
				timeoutMs: STORE_OPERATION_TIMEOUT_MS,
			}
		);

		if (entryId) {
			return entryId;
		}

		if (lastError) {
			logger.warn(
				"Stream store failed after retries — falling through to WAL",
				{
					topic,
					error: lastError.message,
				}
			);
		}

		return null;
	}

	private async _tryStoreOnce(
		topic: string,
		serialized: string,
		redis: Redis
	): Promise<string> {
		const entryId = await redis.xadd(
			`${this._prefix}stream:${topic}`,
			"MAXLEN",
			"~",
			ENV.REDIS_STREAM_MAXLEN,
			"*",
			"data",
			serialized
		);
		await redis.expire(
			`${this._prefix}stream:${topic}`,
			ENV.REDIS_MESSAGE_TTL_S
		);
		return entryId ?? "";
	}
}
