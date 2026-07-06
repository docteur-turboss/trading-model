import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalBatchFlusher } from "./wal-batch-flusher";
import type { WalFlushErrorHandler } from "./wal-flush-error-handler";

const WAL_BATCH_SIZE = 50;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class WalFlushLoop {
	constructor(
		private readonly _batchFlusher: WalBatchFlusher,
		private readonly _errorHandler: WalFlushErrorHandler,
		private readonly _walKey: () => string,
	) {}

	async drainAll(): Promise<void> {
		const redis = await getStreamClient();
		let consecutiveErrors = 0;
		while (true) {
			const raw = await this._readWalEntries(redis);
			if (raw.length === 0) {
				break;
			}

			if (await this._batchFlusher.flushBatch(raw)) {
				consecutiveErrors = 0;
				continue;
			}

			if (!(await this._handleBatchError(raw, consecutiveErrors))) {
				break;
			}
			consecutiveErrors++;
			break;
		}
	}

	private async _readWalEntries(redis: import("ioredis").Redis): Promise<string[]> {
		return (await redis.eval(ATOMIC_WAL_READ_LUA, 1, this._walKey(), WAL_BATCH_SIZE.toString())) as string[];
	}

	private async _handleBatchError(
		raw: string[],
		consecutiveErrors: number
	): Promise<boolean> {
		const nextErrors = consecutiveErrors + 1;
		logger.warn("WAL flush pipeline: some commands failed — retrying batch", {
			consecutiveErrors: nextErrors,
			batchSize: raw.length,
		});
		const action = await this._errorHandler.handle(raw, nextErrors, this._walKey());
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
