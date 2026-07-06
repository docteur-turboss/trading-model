import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalEntryParser } from "./wal-entry-parser";

export type WalErrorAction = "retry" | "memory-buffer" | "abort";

export class WalErrorHandler {
	constructor(
		private readonly _walKey: () => string,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {}

	async handleFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<WalErrorAction> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer"
			);
			this.bufferEntries(raw);
			return "memory-buffer";
		}

		if (raw.length > 0) {
			try {
				const redis = await getStreamClient();
				const restore = redis.multi();
				for (const entry of raw) {
					restore.rpush(this._walKey(), entry);
				}
				await restore.exec();
			} catch {
				this.bufferEntries(raw);
			}
		}

		return "retry";
	}

	bufferEntries(raw: string[]): void {
		for (const entry of raw) {
			const parsed = WalEntryParser.parseWithMessage(entry);
			if (parsed) {
				this._memoryWalBuffer.push(
					parsed.topic,
					parsed.serialized,
					parsed.message as any
				);
			}
		}
	}
}
