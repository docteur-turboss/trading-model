import { retryFileAppend } from "@trading-model/common/utils/retry-file-append";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { FallbackFileRecovery } from "./fallback-file-recovery";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class MemoryWalFallback {
	private readonly _fileRecovery = new FallbackFileRecovery();

	constructor(private readonly _prefix: string) {}

	async trySaveToRedis(removed: MemoryWalEntry[]): Promise<boolean> {
		try {
			const redis = await getStreamClient();
			const multi = redis.multi();
			for (const entry of removed) {
				multi.rpush(
					`${this._prefix}wal_buffer`,
					JSON.stringify({ topic: entry.topic, serialized: entry.serialized })
				);
			}
			await multi.exec();
			return true;
		} catch {
			return false;
		}
	}

	async trySaveToFallback(removed: MemoryWalEntry[]): Promise<void> {
		const lines = removed.map((entry) => JSON.stringify(entry)).join("\n");
		const fileWritten = await retryFileAppend(
			ENV.DLQ_LOCAL_FALLBACK_PATH,
			lines
		);
		if (!fileWritten) {
			logger.error(
				"Memory WAL buffer eviction: all persistence layers exhausted — messages lost",
				{ evictedCount: removed.length, buffer: "memory-wal" }
			);
		}
	}

	async recoverFromFallbackFile(): Promise<MemoryWalEntry[]> {
		return this._fileRecovery.recover();
	}
}
