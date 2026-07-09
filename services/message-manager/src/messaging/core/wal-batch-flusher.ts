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
		this._addParsedEntries(multi, raw);

		try {
			return await this._executeBatch(multi);
		} catch {
			return false;
		}
	}

	private _addParsedEntries(
		multi: ReturnType<import("ioredis").Redis["multi"]>,
		raw: string[]
	): void {
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
	}

	private async _executeBatch(
		multi: ReturnType<import("ioredis").Redis["multi"]>
	): Promise<boolean> {
		const results = await multi.exec();
		if (!results) {
			return true;
		}
		return !results.some((resultItem) => resultItem[0] !== null);
	}
}
