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
		if (this._isConnected()) {
			return true;
		}
		if (this._connecting) {
			return false;
		}

		await this._closeExistingClient();
		this._connecting = true;
		try {
			return await this._tryConnect();
		} catch (err) {
			this._handleConnectError(err);
			return false;
		} finally {
			this._connecting = false;
		}
	}

	private async _tryConnect(): Promise<boolean> {
		const url = env.REDIS_URL;
		if (!url) {
			logger.info("No REDIS_URL configured — Redis queue unavailable");
			return false;
		}

		this._client = this._createClient(url);
		this._attachEventHandlers();
		await this._client.connect();

		this._connected = true;
		this._wasEverConnected = true;
		return true;
	}

	private _handleConnectError(err: unknown): void {
		logger.warn("Redis queue unavailable — falling back to MongoDB polling", {
			error: (err as Error).message,
		});
		this._client = null;
		this._connected = false;
	}

	private _isConnected(): boolean {
		return Boolean(this._client && this._connected);
	}

	private async _closeExistingClient(): Promise<void> {
		if (this._client && !this._connected) {
			await this.close();
		}
	}

	private _createClient(url: string): Redis {
		return new Redis(url, {
			lazyConnect: true,
			retryStrategy: (times) => Math.min(times * 200, 5_000),
		});
	}

	private _attachEventHandlers(): void {
		if (!this._client) {
			return;
		}
		this._client.on("connect", () => this._onConnect());
		this._client.on("close", () => this._onClose());
		this._client.on("error", (err) => this._onError(err));
	}

	private _onConnect(): void {
		this._connected = true;
		if (this._wasEverConnected) {
			logger.info("Redis queue reconnected — triggering queue rebuild");
			this._onReconnectCb?.();
		}
		this._wasEverConnected = true;
	}

	private _onClose(): void {
		this._connected = false;
	}

	private _onError(err: Error): void {
		logger.error("Redis queue client error", { error: err.message });
		this._connected = false;
	}

	async push(entryId: string, maxQueueSize = 50_000): Promise<boolean> {
		if (!(this._client && this._connected)) {
			return false;
		}
		try {
			return await this._tryPush(entryId, maxQueueSize);
		} catch {
			return false;
		}
	}

	private async _tryPush(
		entryId: string,
		maxQueueSize: number
	): Promise<boolean> {
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
	}

	async pop(): Promise<string | null> {
		if (!(this._client && this._connected)) {
			return null;
		}
		try {
			await this._ensurePopScript();
			const result = await this._client.evalsha(
				this._popScriptHash!,
				1,
				this._queueKey
			);
			return this._extractFirstEntry(result as string[]);
		} catch {
			return null;
		}
	}

	private async _ensurePopScript(): Promise<void> {
		if (!this._popScriptHash) {
			this._popScriptHash = (await this._client.script(
				"LOAD",
				DlqRedisQueue._POP_SCRIPT
			)) as string;
		}
	}

	private _extractFirstEntry(entries: string[]): string | null {
		return entries.length > 0 ? (entries[0] ?? null) : null;
	}

	setOnReconnect(cb: () => void): void {
		this._onReconnectCb = cb;
	}

	isAvailable(): boolean {
		return this._connected;
	}

	async close(): Promise<void> {
		if (this._client) {
			await this._closeClient();
			this._client.removeAllListeners();
			this._client = null;
		}
		this._connected = false;
		this._popScriptHash = null;
	}

	private async _closeClient(): Promise<void> {
		try {
			if (this._client.status === "ready") {
				await this._client.quit();
			} else {
				this._client.disconnect();
			}
		} catch {
			this._client.disconnect();
		}
	}
}

export const dlqRedisQueue = new DlqRedisQueue();
