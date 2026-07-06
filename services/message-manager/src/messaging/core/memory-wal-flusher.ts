import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { RedisBackoff } from "./redis-backoff";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

const WAL_BATCH_SIZE = 50;

interface MemoryWalEntry {
	topic: string;
	serialized: string;
	message: import("@trading-model/common/contracts/message.types").Message;
}

export class MemoryWalFlusher {
	private _flushing = false;
	private readonly _flusherTimer = new TimerHandle();
	private readonly _redisBackoff = new RedisBackoff();
	private readonly _walBatchFlusher: WalBatchFlusher;

	constructor(private readonly _prefix: string) {
		this._walBatchFlusher = new WalBatchFlusher(
			_prefix,
			ENV.REDIS_STREAM_MAXLEN,
			ENV.REDIS_MESSAGE_TTL_S
		);
	}

	start(buffer?: MemoryWalEntry[]): void {
		this.startFlusher(buffer ?? []);
	}

	startFlusher(buffer: MemoryWalEntry[]): void {
		this._flusherTimer.startInterval(() => {
			this.flush(buffer).catch(() => {});
		}, 500);
		this._flusherTimer.unref();
	}

	stop(): void {
		this.stopFlusher();
	}

	stopFlusher(): void {
		this._flusherTimer.stop();
	}

	get isFlushing(): boolean {
		return this._flushing;
	}

	async flush(buffer: MemoryWalEntry[]): Promise<void> {
		if (this._shouldSkipFlush(buffer)) {
			return;
		}

		this._flushing = true;
		try {
			const batch = buffer.splice(0, WAL_BATCH_SIZE);
			const serialized = batch.map((e) =>
				JSON.stringify({ topic: e.topic, serialized: e.serialized, message: e.message })
			);
			const ok = await this._walBatchFlusher.flushBatch(serialized);
			if (ok) {
				this._redisBackoff.markUp();
				this._redisBackoff.resetBackoff();
				return;
			}
			await this._handleFlushFailure(batch, undefined, buffer);
		} finally {
			this._flushing = false;
		}
	}

	drainAll(buffer: MemoryWalEntry[]): Promise<void> {
		return this.flush(buffer);
	}

	private _shouldSkipFlush(buffer: MemoryWalEntry[]): boolean {
		if (this._flushing) {
			return true;
		}
		if (this._redisBackoff.isInRetryWindow()) {
			return true;
		}
		if (buffer.length === 0) {
			this._redisBackoff.resetBackoff();
			return true;
		}
		return false;
	}

	private async _handleFlushFailure(
		batch: MemoryWalEntry[],
		err?: Error,
		buffer?: MemoryWalEntry[]
	): Promise<void> {
		this._redisBackoff.markDown();
		this._redisBackoff.increaseBackoff();
		if (err) {
			logger.warn("Memory WAL flush failed — re-queuing batch", {
				batchSize: batch.length,
				backoff: this._redisBackoff.current,
				error: err.message,
			});
		} else {
			logger.warn("Memory WAL flush partial failure — re-queuing batch", {
				batchSize: batch.length,
				backoff: this._redisBackoff.current,
			});
		}
		if (buffer) {
			buffer.unshift(...batch);
		}
		await this._sleepWithJitter(this._redisBackoff.current);
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
