import Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";

export class RedisConnection {
	private _client: Redis | null = null;
	private _connecting = false;
	private _connected = false;
	private _wasEverConnected = false;
	private _onReconnect: (() => void) | null = null;

	async connect(onReconnect?: () => void): Promise<boolean> {
		this._onReconnect = onReconnect ?? null;
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

	async close(): Promise<void> {
		if (this._client) {
			await this._closeClient();
			this._client.removeAllListeners();
			this._client = null;
		}
		this._connected = false;
	}

	isAvailable(): boolean {
		return this._connected;
	}

	getClient(): Redis | null {
		return this._client;
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
			this._onReconnect?.();
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

	private async _closeClient(): Promise<void> {
		const client = this._client;
		if (!client) {
			return;
		}
		try {
			if (client.status === "ready") {
				await client.quit();
			} else {
				client.disconnect();
			}
		} catch {
			client.disconnect();
		}
	}
}
