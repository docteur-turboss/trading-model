import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { ENV } from "../../config/env";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { FlushFailureHandler } from "./flush-failure-handler";
import { FlushGuard } from "./flush-guard";
import type { MemoryWalEntry } from "./memory-wal-entry";
import { RedisBackoff } from "./redis-backoff";
import { WalBatchFlusher } from "./wal-batch-flusher";

const WAL_BATCH_SIZE = 50;

export class MemoryWalFlusher {
	private readonly _flusherTimer = new TimerHandle();
	private readonly _redisBackoff = new RedisBackoff();
	private readonly _walBatchFlusher: WalBatchFlusher;
	private readonly _flushGuard: FlushGuard;
	private readonly _flushFailureHandler: FlushFailureHandler;

	constructor(readonly _keys: RedisKeyBuilder) {
		this._walBatchFlusher = new WalBatchFlusher(
			_keys,
			ENV.REDIS_STREAM_MAXLEN,
			ENV.REDIS_MESSAGE_TTL_S
		);
		this._flushGuard = new FlushGuard();
		this._flushFailureHandler = new FlushFailureHandler();
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
		return this._flushGuard.isFlushing;
	}

	private _flushBatch(batch: MemoryWalEntry[]): Promise<boolean> {
		if (batch.length === 0) {
			return Promise.resolve(false);
		}
		const serialized = batch.map((entry) =>
			JSON.stringify({
				topic: entry.topic,
				serialized: entry.serialized,
				message: entry.message,
			})
		);
		return this._walBatchFlusher.flushBatch(serialized);
	}

	async flush(buffer: MemoryWalEntry[]): Promise<void> {
		if (this._flushGuard.shouldSkip(buffer, this._redisBackoff)) {
			return;
		}

		this._flushGuard.setFlushing(true);
		try {
			await this._flushBufferBatch(buffer);
		} finally {
			this._flushGuard.setFlushing(false);
		}
	}

	private async _flushBufferBatch(buffer: MemoryWalEntry[]): Promise<void> {
		const batch = buffer.splice(0, WAL_BATCH_SIZE);
		const ok = await this._flushBatch(batch);
		if (ok) {
			this._redisBackoff.markUp();
			this._redisBackoff.resetBackoff();
			return;
		}
		await this._flushFailureHandler.handle(batch, this._redisBackoff, buffer);
	}

	drainAll(buffer: MemoryWalEntry[]): Promise<void> {
		return this.flush(buffer);
	}
}
