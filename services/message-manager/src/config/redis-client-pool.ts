import type Redis from "ioredis";
import { AsyncDeduper } from "@trading-model/common/utils/async-deduper";
import { logger } from "./logger";
import { attachEventHandlers, createEventHandlers, detachEventHandlers } from "./redis-event-handlers";

export class RedisClientPool {
	private _client: Redis | null = null;
	private readonly _connectionDeduper = new AsyncDeduper<Redis>();

	constructor(
		private readonly _name: string,
		private readonly _isClosed: () => boolean,
		private readonly _onReconnectedCallbacks: Array<() => void>
	) {}

	private _isReady(): boolean { return Boolean(this._client && this._client.status === "ready"); }
	private _isReconnecting(): boolean { return Boolean(this._client && (this._client.status === "connecting" || this._client.status === "reconnecting")); }
	private async _waitForClientReady(): Promise<Redis> {
		const ReconnectTimeoutMs = 30000;
		await new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(() => reject(new Error("timeout")), ReconnectTimeoutMs);
			this._client!.once("ready", () => { clearTimeout(timeoutId); resolve(); });
		});
		return this._client!;
	}
	private async _waitForReconnect(): Promise<Redis | null> {
		if (!this._isReconnecting()) return null;
		try { return await this._waitForClientReady(); }
		catch { return null; }
	}
	private async _createAndConnectClient(buildClient: () => Redis): Promise<Redis> {
		const client = buildClient();
		const handlers = createEventHandlers(this._name, this._isClosed, this._onReconnectedCallbacks);
		attachEventHandlers(client, handlers);
		try {
			await client.connect();
			if (this._isClosed()) { this._destroyClient(client); throw new Error("Redis has been closed"); }
			this._replaceClient(client);
			return client;
		} catch (err) {
			if (!this._isClosed()) logger.error(`${this._name}: failed to connect`, { error: (err as Error).message });
			detachEventHandlers(client, handlers);
			throw err;
		}
	}
	private _replaceClient(client: Redis): void {
		if (this._client && this._client !== client) this._destroyClient(this._client);
		this._client = client;
	}
	private _destroyClient(client: Redis): void {
		client.removeAllListeners();
		try { client.disconnect(); }
		catch { logger.debug("Redis client disconnect error (best-effort)"); }
	}

	async getOrCreate(buildClient: () => Redis): Promise<Redis> {
		if (this._isClosed()) throw new Error("Redis has been closed — cannot create new client");
		if (this._isReady()) return this._client!;
		const pending = this._connectionDeduper.pending;
		if (pending) return pending;
		const reconnected = await this._waitForReconnect();
		if (reconnected) return reconnected;
		return this._connectionDeduper.run(() => this._createAndConnectClient(buildClient));
	}
	destroyAll(): void {
		if (this._client) { this._destroyClient(this._client); this._client = null; }
		this._connectionDeduper.clear();
	}
	getClientOrThrow(): Redis {
		if (this._client?.status !== "ready") throw new Error("Redis is not available");
		return this._client;
	}
}
