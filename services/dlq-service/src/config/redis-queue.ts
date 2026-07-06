import type Redis from "ioredis";

import { logger } from "./logger";
import { RedisConnection } from "./redis-connection";

export class DlqRedisQueue {
	private readonly _connection: RedisConnection;
	private readonly _queueKey: string;
	private _popScriptHash: string | null = null;

	private static readonly _POP_SCRIPT = `
    local entries = redis.call('LRANGE', KEYS[1], -1, -1)
    if #entries > 0 then
      redis.call('LTRIM', KEYS[1], 0, -2)
    end
    return entries
  `;

	constructor(queueKey = "dlq:queue") {
		this._queueKey = queueKey;
		this._connection = new RedisConnection();
	}

	async connect(onReconnect?: () => void): Promise<boolean> {
		return this._connection.connect(onReconnect);
	}

	async push(entryId: string, maxQueueSize = 50_000): Promise<boolean> {
		const client = this._connection.getClient();
		if (!client || !this._connection.isAvailable()) {
			return false;
		}
		try {
			return await this._tryPush(client, entryId, maxQueueSize);
		} catch {
			return false;
		}
	}

	async pop(): Promise<string | null> {
		const client = this._connection.getClient();
		if (!client || !this._connection.isAvailable()) {
			return null;
		}
		try {
			await this._ensurePopScript(client);
			const result = await client.evalsha(
				this._popScriptHash!,
				1,
				this._queueKey
			);
			return this._extractFirstEntry(result as string[]);
		} catch {
			return null;
		}
	}

	isAvailable(): boolean {
		return this._connection.isAvailable();
	}

	async close(): Promise<void> {
		await this._connection.close();
		this._popScriptHash = null;
	}

	private async _tryPush(
		client: Redis,
		entryId: string,
		maxQueueSize: number
	): Promise<boolean> {
		const size = await client.llen(this._queueKey);
		if (size >= maxQueueSize) {
			logger.warn("Redis queue size limit reached — dropping push", {
				queueKey: this._queueKey,
				size,
				maxSize: maxQueueSize,
			});
			return false;
		}
		await client.lpush(this._queueKey, entryId);
		return true;
	}

	private async _ensurePopScript(client: Redis): Promise<void> {
		if (!this._popScriptHash) {
			this._popScriptHash = (await client.script(
				"LOAD",
				DlqRedisQueue._POP_SCRIPT
			)) as string;
		}
	}

	private _extractFirstEntry(entries: string[]): string | null {
		return entries.length > 0 ? (entries[0] ?? null) : null;
	}
}

export const dlqRedisQueue = new DlqRedisQueue();
