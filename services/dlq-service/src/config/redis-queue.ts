import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";

import { logger } from "./logger";
import { RedisConnection } from "./redis-connection";

export class DlqRedisQueue {
	private readonly _connection: RedisConnection;
	private readonly _queueKey: string;
	private static readonly _POP_SCRIPT = `
    local entries = redis.call('LRANGE', KEYS[1], -1, -1)
    if #entries > 0 then
      redis.call('LTRIM', KEYS[1], 0, -2)
    end
    return entries
  `;
	// Checks the size and pushes in one step, so concurrent pushes cannot
	// overshoot the limit. Returns { accepted (0|1), size before the push }.
	private static readonly _BOUNDED_PUSH_SCRIPT = `
    local size = redis.call('LLEN', KEYS[1])
    if size >= tonumber(ARGV[2]) then
      return {0, size}
    end
    redis.call('LPUSH', KEYS[1], ARGV[1])
    return {1, size}
  `;

	constructor(queueKey = "dlq:queue") {
		this._queueKey = queueKey;
		this._connection = new RedisConnection();
	}

	connect(onReconnect?: () => void): Promise<boolean> {
		return this._connection.connect(onReconnect);
	}

	async push(entryId: string, maxQueueSize = 50_000): Promise<boolean> {
		const client = this._connection.getClient();
		if (!(client && this._connection.isAvailable())) {
			return false;
		}
		try {
			return await this._tryPush(client, entryId, maxQueueSize);
		} catch (err) {
			// Never throws: callers treat `false` as "not queued"; the entry stays
			// queuable in MongoDB and is re-seeded by the next queue rebuild.
			logger.error("Redis queue push failed", {
				queueKey: this._queueKey,
				entryId,
				error: normalizeError(err).message,
			});
			return false;
		}
	}

	async pop(): Promise<string | null> {
		const client = this._connection.getClient();
		if (!(client && this._connection.isAvailable())) {
			return null;
		}
		try {
			const result = await client.eval(
				DlqRedisQueue._POP_SCRIPT,
				1,
				this._queueKey
			);
			return this._extractFirstEntry(result as string[]);
		} catch (err) {
			logger.error("Redis queue pop failed", {
				queueKey: this._queueKey,
				error: normalizeError(err).message,
			});
			return null;
		}
	}

	isAvailable(): boolean {
		return this._connection.isAvailable();
	}

	async close(): Promise<void> {
		await this._connection.close();
	}

	private async _tryPush(
		client: Redis,
		entryId: string,
		maxQueueSize: number
	): Promise<boolean> {
		const [accepted, size] = (await client.eval(
			DlqRedisQueue._BOUNDED_PUSH_SCRIPT,
			1,
			this._queueKey,
			entryId,
			maxQueueSize
		)) as [number, number];
		if (accepted === 0) {
			logger.warn("Redis queue size limit reached — dropping push", {
				queueKey: this._queueKey,
				size,
				maxSize: maxQueueSize,
			});
			return false;
		}
		return true;
	}

	private _extractFirstEntry(entries: string[]): string | null {
		return entries.length > 0 ? (entries[0] ?? null) : null;
	}
}

export const dlqRedisQueue = new DlqRedisQueue();
