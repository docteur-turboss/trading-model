import {
	DurationMs,
	type Topic,
} from "@trading-model/common/domain/primitives";
import { retryWithBackoff } from "@trading-model/common/utils/retry";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "./redis-key-builder";

const MAX_WAL_RETRY = 10;
const STORE_OPERATION_TIMEOUT_MS = 15_000;

export class RedisStreamStore {
	constructor(private readonly _keys: RedisKeyBuilder) {}

	async store(topic: Topic, serialized: string): Promise<string | null> {
		const redis = await getStreamClient();
		const { result: entryId, lastError } = await retryWithBackoff(
			() => this._tryStoreOnce(topic, serialized, redis),
			{
				maxRetries: MAX_WAL_RETRY,
				baseDelayMs: DurationMs.of(100),
				maxDelayMs: DurationMs.of(5000),
				timeoutMs: DurationMs.of(STORE_OPERATION_TIMEOUT_MS),
			}
		);

		if (entryId) {
			return entryId;
		}

		this._logStoreFailure(topic, lastError);
		return null;
	}

	private _logStoreFailure(topic: Topic, lastError: Error | null): void {
		if (!lastError) {
			return;
		}
		logger.warn(
			"Stream store failed after retries and falling through to WAL",
			{
				topic,
				error: lastError.message,
			}
		);
	}

	private async _tryStoreOnce(
		topic: Topic,
		serialized: string,
		redis: Redis
	): Promise<string> {
		const key = this._keys.key("stream", topic);
		const entryId = await redis.xadd(
			key,
			"MAXLEN",
			"~",
			ENV.REDIS_STREAM_MAXLEN,
			"*",
			"data",
			serialized
		);
		await redis.expire(key, ENV.REDIS_MESSAGE_TTL_S);
		return entryId ?? "";
	}
}
