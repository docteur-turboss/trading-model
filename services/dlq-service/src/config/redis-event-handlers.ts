import type Redis from "ioredis";

import { logger } from "./logger";

export interface RedisStateDelegate {
	onConnected(): void;
	onDisconnected(): void;
	wasEverConnected(): boolean;
	setWasEverConnected(): void;
}

export class RedisEventHandlers {
	private readonly _delegate: RedisStateDelegate;

	constructor(delegate: RedisStateDelegate) {
		this._delegate = delegate;
	}

	attach(client: Redis, onReconnect: (() => void) | null): void {
		client.on("connect", () => this._onConnect(onReconnect));
		client.on("close", () => this._onClose());
		client.on("error", (err) => this._onError(err));
	}

	private _onConnect(onReconnect: (() => void) | null): void {
		this._delegate.onConnected();
		if (this._delegate.wasEverConnected()) {
			logger.info("Redis queue reconnected — triggering queue rebuild");
			onReconnect?.();
		}
		this._delegate.setWasEverConnected();
	}

	private _onClose(): void {
		this._delegate.onDisconnected();
	}

	private _onError(err: Error): void {
		logger.error("Redis queue client error", { error: err.message });
		this._delegate.onDisconnected();
	}
}
