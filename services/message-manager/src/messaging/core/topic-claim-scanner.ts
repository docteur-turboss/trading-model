import type Redis from "ioredis";

export class TopicClaimScanner {
	constructor(private readonly _prefix: string) {}

	async scan(redis: Redis): Promise<string[]> {
		const topics: string[] = [];
		let cursor = "0";
		do {
			cursor = await this._scanPage(redis, cursor, topics);
		} while (cursor !== "0");
		return topics;
	}

	async claimForTopic(
		redis: Redis,
		topic: string,
		claimOpts: {
			groupName: string;
			consumerId: string;
			minIdleMs: number;
			count: number;
		}
	): Promise<number> {
		const { groupName, consumerId, minIdleMs, count } = claimOpts;
		const streamKey = `${this._prefix}stream:${topic}`;
		try {
			const pending = await redis.xpending(
				streamKey,
				groupName,
				"-",
				"+",
				count,
				consumerId
			);
			const pendingEntries = pending as [string, string, number, number][];
			const claimable = pendingEntries
				.filter(([, , , idleMs]) => idleMs >= minIdleMs)
				.map(([id]) => id);

			if (claimable.length > 0) {
				const claimed = await redis.xclaim(
					streamKey,
					groupName,
					consumerId,
					minIdleMs,
					...claimable
				);
				return (claimed as unknown[]).length;
			}
			return 0;
		} catch {
			return 0;
		}
	}

	private async _scanPage(
		redis: Redis,
		cursor: string,
		topics: string[]
	): Promise<string> {
		const [nextCursor, batch] = await redis.sscan(
			`${this._prefix}topics`,
			cursor,
			"COUNT",
			100
		);
		topics.push(...batch);
		return nextCursor;
	}
}
