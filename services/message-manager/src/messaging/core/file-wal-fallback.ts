import { retryFileAppend } from "@trading-model/common/utils/retry-file-append";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { FallbackFileRecovery } from "./fallback-file-recovery";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class FileWalFallback {
	private readonly _fileRecovery = new FallbackFileRecovery();

	async trySave(removed: MemoryWalEntry[]): Promise<void> {
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

	recover(): Promise<MemoryWalEntry[]> {
		return this._fileRecovery.recover();
	}
}
