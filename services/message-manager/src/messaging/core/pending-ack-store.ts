import type { Message } from "@trading-model/common/contracts/message.types";
import { getStreamClient } from "../../config/redis";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

export class PendingAckStore {
	private readonly _prefix: string;

	constructor(prefix: string) {
		this._prefix = prefix;
	}

	private _pendingKey(instanceId: string): string {
		return `${this._prefix}pending:${instanceId}`;
	}

	async add(
		instanceId: string,
		messageId: string,
		data: { topic: string; subscriberUrl: string; message: Message }
	): Promise<void> {
		const redis = await getStreamClient();
		await redis.hset(
			this._pendingKey(instanceId),
			messageId,
			JSON.stringify({ ...data, pendingAt: Date.now() })
		);
		await redis.expire(this._pendingKey(instanceId), ENV.REDIS_MESSAGE_TTL_S);
	}

	async remove(instanceId: string, messageId: string): Promise<void> {
		const redis = await getStreamClient();
		await redis.hdel(this._pendingKey(instanceId), messageId);
	}

	async getAll(
		instanceId: string
	): Promise<
		Record<string, { topic: string; subscriberUrl: string; message: Message }>
	> {
		const redis = await getStreamClient();
		const result: Record<
			string,
			{ topic: string; subscriberUrl: string; message: Message }
		> = {};
		let cursor = "0";
		do {
			const [nextCursor, batch] = await redis.hscan(
				this._pendingKey(instanceId),
				cursor,
				"COUNT",
				200
			);
			cursor = nextCursor;
			for (let i = 0; i < batch.length; i += 2) {
				try {
					result[batch[i]] = JSON.parse(batch[i + 1]);
				} catch {}
			}
		} while (cursor !== "0");
		return result;
	}

	async recoverStale(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		try {
			const redis = await getStreamClient();
			const pendingKey = this._pendingKey(ownInstanceId);

			const toDelete: string[] = [];
			const now = Date.now();
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
					try {
						const entry = JSON.parse(data) as {
							topic: string;
							subscriberUrl: string;
							message: Message;
							pendingAt?: number;
						};
						const age =
							entry.pendingAt === undefined
								? now -
									new Date(entry.message.metadata.emittedAt ?? 0).getTime()
								: now - entry.pendingAt;
						if (age > maxAgeMs) {
							toDelete.push(msgId);
						}
					} catch {
						toDelete.push(msgId);
					}
				}
			} while (cursor !== "0");

			if (toDelete.length > 0) {
				await redis.hdel(pendingKey, ...toDelete);
				logger.info(
					`Recovered ${toDelete.length} stale pending acks for instance ${ownInstanceId}`
				);
			}
			return toDelete.length;
		} catch (err) {
			logger.warn("Failed to recover pending acks", { context: {
				error: (err as Error).message,
			} });
			return 0;
		}
	}
}
