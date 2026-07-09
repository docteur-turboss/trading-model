import { getStreamClient } from "../../config/redis";
import type { MemoryWalEntry } from "./memory-wal-entry";

export class RedisWalFallback {
	constructor(private readonly _prefix: string) {}

	async trySave(removed: MemoryWalEntry[]): Promise<boolean> {
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
}
