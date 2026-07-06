import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";
import { retryWithBackoff } from "@trading-model/common/utils/retry";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_TOTAL } from "../../config/metrics";
import { getStreamClient } from "../../config/redis";
import { WalFlusherService } from "./wal-flusher-service";

const MAX_WAL_RETRY = 10;
const STORE_OPERATION_TIMEOUT_MS = 15_000;

export class MessageStreamWriter {
	constructor(
		private readonly _prefix: string,
		private readonly _walFlusher: WalFlusherService
	) {}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	private async _tryStoreOnce(
		topic: string,
		serialized: string,
		redis: Redis
	): Promise<string> {
		const entryId = await redis.xadd(
			this._streamKey(topic),
			"MAXLEN",
			"~",
			ENV.REDIS_STREAM_MAXLEN,
			"*",
			"data",
			serialized
		);
		await redis.expire(this._streamKey(topic), ENV.REDIS_MESSAGE_TTL_S);
		return entryId ?? "";
	}

	private async _storeInRedisStream(
		topic: string,
		serialized: string
	): Promise<string | null> {
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

	async store(topic: string, message: Message): Promise<string> {
		const serialized = safeStringify(message);

		if (this._isPayloadTooLarge(topic, serialized)) {
			return "payload-too-large";
		}

		const entryId = await this._storeInRedisStream(topic, serialized);
		if (entryId !== null) {
			return entryId;
		}

		return this._storeInWal(topic, serialized, message);
	}

	private _isPayloadTooLarge(topic: string, serialized: string): boolean {
		if (serialized.length <= ENV.MAX_PAYLOAD_BYTES) {
			return false;
		}
		logger.error("Message payload exceeds maximum size", { context: {
			topic,
			size: serialized.length,
			max: ENV.MAX_PAYLOAD_BYTES,
		} });
		MESSAGES_DLQ_TOTAL.inc({ topic, reason: "PAYLOAD_TOO_LARGE" });
		return true;
	}

	private async _storeInWal(
		topic: string,
		serialized: string,
		message: Message
	): Promise<string> {
		try {
			await this._walFlusher.storeInWal(topic, serialized);
		} catch (err) {
			logger.warn("Redis WAL list write failed, writing to in-memory buffer", { context: {
				topic,
				error: (err as Error).message,
			} });
			this._walFlusher.bufferInMemory(topic, serialized, message);
			return "memory-buffered";
		}

		this._walFlusher.flush().catch(() => {});
		return "wal-buffered";
	}
}
