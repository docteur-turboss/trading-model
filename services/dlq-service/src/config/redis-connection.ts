import type Redis from "ioredis";
import { ENV } from "./env";
import { logger } from "./logger";
import { RedisClientManager } from "./redis-client-manager";

enum ConnectionState {
	Idle = "Idle",
	Connecting = "Connecting",
	Connected = "Connected",
	Disconnected = "Disconnected",
}

export class RedisConnection {
	private readonly _clientManager = new RedisClientManager();
	private _state: ConnectionState = ConnectionState.Idle;
	private _onReconnect: () => void = () => {};

	async connect(onReconnect?: () => void): Promise<boolean> {
		this._onReconnect = onReconnect ?? (() => {});
		if (this._isConnected()) return true;
		if (this._state === ConnectionState.Connecting) return false;
		await this._closeExistingClient();
		this._state = ConnectionState.Connecting;
		try { return await this._tryConnect(); } catch (err) { this._handleConnectError(err); return false; }
	}
	async close(): Promise<void> {
		if (this._clientManager.getClient()) { await this._clientManager.closeClient(); this._clientManager.removeAllListeners(); }
		this._state = ConnectionState.Disconnected;
	}
	isAvailable(): boolean { return this._state === ConnectionState.Connected; }
	getClient(): Redis | null { return this._clientManager.getClient(); }

	private async _tryConnect(): Promise<boolean> {
		const url = ENV.REDIS_URL;
		if (!url) { logger.info("No REDIS_URL configured — Redis queue unavailable"); return false; }
		const client = await this._clientManager.createClient(url);
		this._attachEventHandlers(client);
		this._state = ConnectionState.Connected;
		return true;
	}
	private _handleConnectError(err: unknown): void {
		logger.warn("Redis queue unavailable — falling back to MongoDB polling", { error: (err as Error).message });
		if (this._state === ConnectionState.Connecting && this._wasEverConnected()) {
			this._state = ConnectionState.Disconnected;
		} else { this._state = ConnectionState.Idle; }
	}
	private _wasEverConnected(): boolean { return this._state === ConnectionState.Disconnected; }
	private _isConnected(): boolean { return Boolean(this._clientManager.getClient() && this._state === ConnectionState.Connected); }
	private async _closeExistingClient(): Promise<void> { if (this._clientManager.getClient() && !this._isConnected()) await this.close(); }
	private _attachEventHandlers(client: Redis): void {
		client.on("connect", () => this._onConnect());
		client.on("close", () => this._onClose());
		client.on("error", (err) => this._onError(err));
	}
	private _onConnect(): void {
		const isReconnect = this._state === ConnectionState.Disconnected;
		this._state = ConnectionState.Connected;
		if (isReconnect) { logger.info("Redis queue reconnected — triggering queue rebuild"); this._onReconnect(); }
	}
	private _onClose(): void { if (this._state === ConnectionState.Connected) this._state = ConnectionState.Disconnected; }
	private _onError(err: Error): void {
		logger.error("Redis queue client error", { error: err.message });
		if (this._state === ConnectionState.Connected) this._state = ConnectionState.Disconnected;
	}
}
