import type { PendingAckData } from "./messaging-types";

interface StaleEntryData extends PendingAckData {
	pendingAt?: number;
}

function computeEntryAge(entry: StaleEntryData, now: number): number {
	return entry.pendingAt === undefined
		? now - new Date(entry.message.metadata.emittedAt ?? 0).getTime()
		: now - entry.pendingAt;
}

export class StaleEntryScanner {
	async scan(
		redis: import("ioredis").Redis,
		pendingKey: string,
		now: number,
		maxAgeMs: number
	): Promise<string[]> {
		const toDelete: string[] = [];
		let cursor = "0";

		do {
			const [nextCursor, batch] = await redis.hscan(
				pendingKey,
				cursor,
				"COUNT",
				200
			);
			cursor = nextCursor;

			for (let i = 0; i < batch.length; i += 2) {
				const msgId = batch[i];
				const data = batch[i + 1];
				if (this._isStaleEntry(data, now, maxAgeMs)) {
					toDelete.push(msgId);
				}
			}
		} while (cursor !== "0");

		return toDelete;
	}

	private _isStaleEntry(data: string, now: number, maxAgeMs: number): boolean {
		try {
			const entry = JSON.parse(data) as StaleEntryData;
			return computeEntryAge(entry, now) > maxAgeMs;
		} catch {
			return true;
		}
	}
}
