import { EventEmitter } from "events";

import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import { WsConnectionManager } from "./ws-connection-manager";

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export class WssTransportConnection {
	private _emitter = new EventEmitter();
	private _state: ConnectionState = "disconnected";
	private _destroyed = false;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private readonly _connectionManager: WsConnectionManager;

	on(event: string, listener: (...args: unknown[]) => void): this {
		this._emitter.on(event, listener);
		return this;
	}

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths,
		private readonly _bootstrapToken?: string
	) {
		this._connectionManager = new WsConnectionManager(this._url, tlsConfig, this._bootstrapToken);
	}

	connect(): void {
		if (this._destroyed || this._state === "connected" || this._state === "connecting") {
			return;
		}
		this._connectWs();
	}

	get state(): ConnectionState {
		return this._state;
	}

	get ws() {
		return this._connectionManager.ws;
	}

	private _connectWs(): void {
		if (this._destroyed) {
			return;
		}
		this._state = "connecting";
		this._connectionManager.connect(
			() => {
				this._state = "connected";
				this._wsReconnectState.attempt = 0;
				this._connectionManager.sendWsAuth();
				this._emitter.emit("open");
			},
			(data) => {
				this._emitter.emit("message", data);
			},
			() => {
				this._state = "disconnected";
				if (!this._destroyed) {
					this._scheduleReconnect();
				}
				this._emitter.emit("close");
			},
			(err) => {
				if (!this._connectionManager.ws || this._connectionManager.ws.readyState !== this._connectionManager.ws.OPEN) {
					this._scheduleReconnect();
				}
				this._emitter.emit("error", err);
			},
			() => {
				this._scheduleReconnect();
			},
		);
	}

	private _scheduleReconnect(): void {
		if (this._destroyed) {
			return;
		}
		this._state = "reconnecting";
		scheduleWsReconnect({
			state: this._wsReconnectState,
			config: { baseDelayMs: 1000, maxDelayMs: 60000, jitterMs: 500 },
			onReconnect: () => {
				this._connectionManager.cleanup();
				this._connectWs();
			},
			logger,
		});
	}

	disconnect(): void {
		this._connectionManager.cleanup();
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
		this._state = "disconnected";
	}

	destroy(): void {
		this._destroyed = true;
		this._wsReconnectState.destroyed = true;
		this.disconnect();
	}
}
