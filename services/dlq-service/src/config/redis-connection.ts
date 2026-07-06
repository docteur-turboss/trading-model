import type Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";
import { RedisClientManager } from "./redis-client-manager";

export class RedisConnection {
	private readonly _clientManager = new RedisClientManager();
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
		if (this._clientManager.getClient()) {
			await this._clientManager.closeClient();
			this._clientManager.removeAllListeners();
		}
		this._connected = false;
	}

	isAvailable(): boolean {
		return this._connected;
	}

	getClient(): Redis | null {
		return this._clientManager.getClient();
	}

	private async _tryConnect(): Promise<boolean> {
		const url = env.REDIS_URL;
		if (!url) {
			logger.info("No REDIS_URL configured — Redis queue unavailable");
			return false;
		}

		const client = await this._clientManager.createClient(url);
		this._attachEventHandlers(client);

		this._connected = true;
		this._wasEverConnected = true;
		return true;
	}

	private _handleConnectError(err: unknown): void {
		logger.warn("Redis queue unavailable — falling back to MongoDB polling", {
			error: (err as Error).message,
		});
		this._connected = false;
	}

	private _isConnected(): boolean {
		return Boolean(this._clientManager.getClient() && this._connected);
	}

	private async _closeExistingClient(): Promise<void> {
		if (this._clientManager.getClient() && !this._connected) {
			await this.close();
		}
	}

	private _attachEventHandlers(client: Redis): void {
		client.on("connect", () => this._onConnect());
		client.on("close", () => this._onClose());
		client.on("error", (err) => this._onError(err));
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
}
