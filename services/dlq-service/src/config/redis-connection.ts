import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";
import type Redis from "ioredis";
import { ENV } from "./env";
import { logger } from "./logger";

enum ConnectionState {
	Idle = "Idle",
	Connecting = "Connecting",
	Connected = "Connected",
	Disconnected = "Disconnected",
}

export class RedisConnection {
	private _client: Redis | null = null;
	private _state: ConnectionState = ConnectionState.Idle;
	private _onReconnect: () => void = () => {};

	async connect(onReconnect?: () => void): Promise<boolean> {
		this._onReconnect = onReconnect ?? (() => {});
		if (this._isConnected()) {
			return true;
		}
		if (this._state === ConnectionState.Connecting) {
			return false;
		}
		await this._closeExistingClient();
		this._state = ConnectionState.Connecting;
		try {
			return await this._tryConnect();
		} catch (err) {
			this._handleConnectError(err);
			return false;
		}
	}
	async close(): Promise<void> {
		if (this._client) {
			await this._disconnectClient();
			this._removeClientListeners();
			this._client = null;
		}
		this._state = ConnectionState.Disconnected;
	}
	isAvailable(): boolean {
		return this._state === ConnectionState.Connected;
	}
	getClient(): Redis | null {
		return this._client;
	}

	private async _tryConnect(): Promise<boolean> {
		const url = ENV.REDIS_URL;
		if (!url) {
			logger.info("No REDIS_URL configured — Redis queue unavailable");
			return false;
		}
		const client = createRedisClient(url) as Redis;
		await client.connect();
		this._attachEventHandlers(client);
		this._client = client;
		this._state = ConnectionState.Connected;
		return true;
	}
	private _handleConnectError(err: unknown): void {
		logger.warn("Redis queue unavailable — falling back to MongoDB polling", {
			error: (err as Error).message,
		});
		if (
			this._state === ConnectionState.Connecting &&
			this._wasEverConnected()
		) {
			this._state = ConnectionState.Disconnected;
		} else {
			this._state = ConnectionState.Idle;
		}
	}
	private _wasEverConnected(): boolean {
		return this._state === ConnectionState.Disconnected;
	}
	private _isConnected(): boolean {
		return Boolean(this._client && this._state === ConnectionState.Connected);
	}
	private async _closeExistingClient(): Promise<void> {
		if (this._client && !this._isConnected()) {
			await this.close();
		}
	}
	private async _disconnectClient(): Promise<void> {
		try {
			if (this._client?.status === "ready") {
				await this._client.quit();
			} else {
				this._client?.disconnect();
			}
		} catch {
			this._client?.disconnect();
		}
	}
	private _removeClientListeners(): void {
		this._client?.removeAllListeners();
	}
	private _attachEventHandlers(client: Redis): void {
		client.on("connect", () => this._onConnect());
		client.on("close", () => this._onClose());
		client.on("error", (err) => this._onError(err));
	}
	private _onConnect(): void {
		const isReconnect = this._state === ConnectionState.Disconnected;
		this._state = ConnectionState.Connected;
		if (isReconnect) {
			logger.info("Redis queue reconnected — triggering queue rebuild");
			this._onReconnect();
		}
	}
	private _onClose(): void {
		if (this._state === ConnectionState.Connected) {
			this._state = ConnectionState.Disconnected;
		}
	}
	private _onError(err: Error): void {
		logger.error("Redis queue client error", { error: err.message });
		if (this._state === ConnectionState.Connected) {
			this._state = ConnectionState.Disconnected;
		}
	}
}
