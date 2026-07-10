import type { Topic } from "@trading-model/common/domain/primitives";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { WAL_BATCH_SIZE } from "../../config/wal-config";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { WalEntryParser } from "./wal-entry-parser";
import { WalErrorHandler } from "./wal-error-handler";

const WAL_LIST_MAX_LEN = 1_000_000;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class WalRedisFlusher {
	private readonly _batchFlusher: WalBatchFlusher;
	private readonly _errorHandler: WalErrorHandler;

	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {
		this._batchFlusher = new WalBatchFlusher(this._prefix, 0, 0);
		this._errorHandler = new WalErrorHandler(
			() => this._walKey(),
			new WalEntryParser(this._memoryWalBuffer)
		);
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	async storeInWal(topic: Topic, serialized: string): Promise<void> {
		const redis = await getStreamClient();
		const walEntry = JSON.stringify({ topic, serialized });
		await redis.rpush(this._walKey(), walEntry);
		await redis.ltrim(this._walKey(), -WAL_LIST_MAX_LEN, -1);
		await redis.expire(this._walKey(), 7200);
	}

	async drainAll(): Promise<void> {
		const redis = await getStreamClient();
		let consecutiveErrors = 0;
		while (true) {
			const raw = await this._readWalBatch(redis);
			if (raw.length === 0) {
				break;
			}

			if (await this._batchFlusher.flushBatch(raw)) {
				consecutiveErrors = 0;
				continue;
			}

			if (!(await this._handleFlushError(raw, consecutiveErrors))) {
				break;
			}
			consecutiveErrors++;
			break;
		}
	}

	private async _readWalBatch(
		redis: import("ioredis").Redis
	): Promise<string[]> {
		return (await redis.eval(
			ATOMIC_WAL_READ_LUA,
			1,
			this._walKey(),
			WAL_BATCH_SIZE.toString()
		)) as string[];
	}

	private async _handleFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<boolean> {
		const nextErrors = consecutiveErrors + 1;
		logger.warn("WAL flush pipeline: some commands failed — retrying batch", {
			consecutiveErrors: nextErrors,
			batchSize: raw.length,
		});
		const action = await this._errorHandler.handleFlushError(raw, nextErrors);
		const backoff = Math.min(1000 * 2 ** nextErrors, 30000);
		await this._sleepWithJitter(backoff);
		return action !== "abort";
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
