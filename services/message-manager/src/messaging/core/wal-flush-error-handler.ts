import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { WalEntryParser } from "./wal-entry-parser";
import { WalErrorAction } from "./wal-error-handler";

export class WalFlushErrorHandler {
	constructor(private readonly _entryParser: WalEntryParser) {}

	async handle(
		raw: string[],
		consecutiveErrors: number,
		walKey: string
	): Promise<WalErrorAction> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer"
			);
			this._entryParser.parseAndBuffer(raw);
			return WalErrorAction.MemoryBuffer;
		}

		if (raw.length > 0) {
			try {
				const redis = await getStreamClient();
				const restore = redis.multi();
				for (const entry of raw) {
					restore.rpush(walKey, entry);
				}
				await restore.exec();
			} catch {
				this._entryParser.parseAndBuffer(raw);
			}
		}

		return WalErrorAction.Retry;
	}
}
