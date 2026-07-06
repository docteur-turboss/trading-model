import { retryFileAppend } from "@trading-model/common/utils/retry-file-append";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class MemoryWalFallback {
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
		try {
			const fs = await import("node:fs/promises");
			const content = await this._readFallbackFile(fs);
			if (!content) {
				return [];
			}
			return await this._processRecoveredContent(fs, content);
		} catch {
			return [];
		}
	}

	private async _readFallbackFile(
		fs: typeof import("node:fs/promises")
	): Promise<string | null> {
		try {
			return await fs.readFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "utf-8");
		} catch {
			return null;
		}
	}

	private async _processRecoveredContent(
		fs: typeof import("node:fs/promises"),
		content: string
	): Promise<MemoryWalEntry[]> {
		const { walEntries, remaining } = this._parseFallbackLines(content);
		await this._writeRemainingLines(fs, remaining);
		return walEntries;
	}

	private _parseFallbackLines(content: string): {
		walEntries: MemoryWalEntry[];
		remaining: string[];
	} {
		const lines = content.split("\n").filter(Boolean);
		const walEntries: MemoryWalEntry[] = [];
		const remaining: string[] = [];
		for (const line of lines) {
			this._classifyLine(line, walEntries, remaining);
		}
		return { walEntries, remaining };
	}

	private _classifyLine(
		line: string,
		walEntries: MemoryWalEntry[],
		remaining: string[]
	): void {
		try {
			const parsed = JSON.parse(line);
			if (this._isValidWalEntry(parsed)) {
				walEntries.push(parsed as MemoryWalEntry);
			} else {
				remaining.push(line);
			}
		} catch {
			remaining.push(line);
		}
	}

	private _isValidWalEntry(parsed: Record<string, unknown>): boolean {
		return !!(parsed?.topic && parsed.message && parsed.deliveryAttempt === undefined);
	}

	private async _writeRemainingLines(
		fs: typeof import("node:fs/promises"),
		remaining: string[]
	): Promise<void> {
		if (remaining.length > 0) {
			await fs.writeFile(
				ENV.DLQ_LOCAL_FALLBACK_PATH,
				`${remaining.join("\n")}\n`,
				"utf-8"
			);
		} else {
			await fs.writeFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "", "utf-8");
		}
	}
}
