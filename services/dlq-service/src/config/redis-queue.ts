import Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";

export class DlqRedisQueue {
	private _client: Redis | null = null;
	private _connecting = false;
	private _connected = false;
	private readonly _queueKey: string;
	private _popScriptHash: string | null = null;
	private _onReconnectCb: (() => void) | null = null;
	private _wasEverConnected = false;

	private static readonly _POP_SCRIPT = `
    local entries = redis.call('LRANGE', KEYS[1], -1, -1)
    if #entries > 0 then
      redis.call('LTRIM', KEYS[1], 0, -2)
    end
    return entries
  `;

	constructor(queueKey = "dlq:queue") {
		this._queueKey = queueKey;
	}

	async connect(): Promise<boolean> {
		if (this._client && this._connected) {
			return true;
		}
		if (this._connecting) {
			return false;
		}

		if (this._client && !this._connected) {
			await this.close();
		}

		this._connecting = true;
		try {
			const url = env.REDIS_URL;
			if (!url) {
				logger.info("No REDIS_URL configured — Redis queue unavailable");
				this._connected = false;
				return false;
			}
			this._client = new Redis(url, {
				lazyConnect: true,
				retryStrategy: (times) => {
					const delay = Math.min(times * 200, 5_000);
					return delay;
				},
			});
			this._client.on("connect", () => {
				this._connected = true;
				if (this._wasEverConnected) {
					logger.info("Redis queue reconnected — triggering queue rebuild");
					this._onReconnectCb?.();
				}
				this._wasEverConnected = true;
			});
			this._client.on("close", () => {
				this._connected = false;
			});
			this._client.on("error", (err) => {
				logger.error("Redis queue client error", { error: err.message });
				this._connected = false;
			});
			await this._client.connect();
			this._connected = true;
			this._wasEverConnected = true;
			return true;
		} catch (err) {
			logger.warn("Redis queue unavailable — falling back to MongoDB polling", {
				error: (err as Error).message,
			});
			this._client = null;
			this._connected = false;
			return false;
		} finally {
			this._connecting = false;
		}
	}

	async push(entryId: string, maxQueueSize = 50_000): Promise<boolean> {
		if (!(this._client && this._connected)) {
			return false;
		}
		try {
			const size = await this._client.llen(this._queueKey);
			if (size >= maxQueueSize) {
				logger.warn("Redis queue size limit reached — dropping push", {
					queueKey: this._queueKey,
					size,
					maxSize: maxQueueSize,
				});
				return false;
			}
			await this._client.lpush(this._queueKey, entryId);
			return true;
		} catch {
			return false;
		}
	}

	async pop(): Promise<string | null> {
		if (!(this._client && this._connected)) {
			return null;
		}
		try {
			if (!this._popScriptHash) {
				this._popScriptHash = (await this._client.script(
					"LOAD",
					DlqRedisQueue._POP_SCRIPT
				)) as string;
			}
			const result = await this._client.evalsha(
				this._popScriptHash!,
				1,
				this._queueKey
			);
			const entries = result as string[];
			return entries.length > 0 ? (entries[0] ?? null) : null;
		} catch {
			return null;
		}
	}

	setOnReconnect(cb: () => void): void {
		this._onReconnectCb = cb;
	}

	isAvailable(): boolean {
		return this._connected;
	}

	async close(): Promise<void> {
		if (this._client) {
			try {
				if (this._client.status === "ready") {
					await this._client.quit();
				} else {
					this._client.disconnect();
				}
			} catch {
				this._client.disconnect();
			}
			this._client.removeAllListeners();
			this._client = null;
		}
		this._connected = false;
		this._popScriptHash = null;
	}
}

export const dlqRedisQueue = new DlqRedisQueue();
