import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { BUFFER_DROPPED_TOTAL } from "../../config/metrics";
import { MemoryWalFallback } from "./memory-wal-fallback";
import { MemoryWalFlusher } from "./memory-wal-flusher";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class MemoryWalBuffer {
	private _buffer: MemoryWalEntry[] = [];
	private readonly _flusher: MemoryWalFlusher;
	private readonly _fallback: MemoryWalFallback;

	constructor(private readonly _prefix: string) {
		this._flusher = new MemoryWalFlusher(this._prefix);
		this._fallback = new MemoryWalFallback(this._prefix);
	}

	startFlusher(): void {
		this._flusher.startFlusher(this._buffer);
	}

	stopFlusher(): void {
		this._flusher.stopFlusher();
	}

	get length(): number {
		return this._buffer.length;
	}

	push(topic: string, serialized: string, message: Message): void {
		this._warnIfNearCapacity();
		if (this._buffer.length >= ENV.MEMORY_WAL_BUFFER_SIZE) {
			this._evictExcess();
		}
		this._buffer.push({ topic, serialized, message });
	}

	private _warnIfNearCapacity(): void {
		const warnThreshold = Math.floor(
			ENV.MEMORY_WAL_BUFFER_SIZE * ENV.MEMORY_WAL_BUFFER_WARN_PCT
		);
		if (this._buffer.length >= warnThreshold) {
			logger.warn("In-memory WAL buffer approaching capacity", { context: {
				bufferSize: this._buffer.length,
				maxSize: ENV.MEMORY_WAL_BUFFER_SIZE,
				threshold: ENV.MEMORY_WAL_BUFFER_WARN_PCT,
			} });
		}
	}

	drainAll(): Promise<void> {
		return this._flusher.drainAll(this._buffer);
	}

	async recoverFromFallbackFile(): Promise<number> {
		const entries = await this._fallback.recoverFromFallbackFile();
		if (entries.length > 0) {
			this._buffer.push(...entries);
			logger.info(`Recovered ${entries.length} WAL entries from fallback file`);
		}
		return entries.length;
	}

	private async _evictExcess(): Promise<void> {
		const { excess, removed } = this._spliceExcess();
		BUFFER_DROPPED_TOTAL.inc(
			{ buffer: "memory-wal", reason: "buffer-full" },
			excess
		);

		const saved = await this._fallback.trySaveToRedis(removed);
		if (!saved) {
			await this._fallback.trySaveToFallback(removed);
		}
	}

	private _spliceExcess(): { excess: number; removed: MemoryWalEntry[] } {
		const excess = this._buffer.length - ENV.MEMORY_WAL_BUFFER_SIZE + 1;
		const removed = this._buffer.splice(0, excess);
		return { excess, removed };
	}
}
