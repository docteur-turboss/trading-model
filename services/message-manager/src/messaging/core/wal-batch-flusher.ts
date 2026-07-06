import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { WalEntryParser } from "./wal-entry-parser";

export class WalBatchFlusher {
	constructor(
		private readonly _prefix: string,
		private readonly _streamMaxlen: number,
		private readonly _messageTtlS: number
	) {}

	async flushBatch(raw: string[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const entry of raw) {
			const parsed = WalEntryParser.parse(entry);
			if (!parsed) {
				continue;
			}
			const key = `${this._prefix}stream:${parsed.topic}`;
			multi.xadd(
				key,
				"MAXLEN",
				"~",
				this._streamMaxlen,
				"*",
				"data",
				parsed.data
			);
			multi.expire(key, this._messageTtlS);
		}

		try {
			const results = await multi.exec();
			if (results) {
				const anyFailed = results.some((resultItem) => resultItem[0] !== null);
				if (anyFailed) {
					return false;
				}
			}
			return true;
		} catch {
			return false;
		}
	}
}
