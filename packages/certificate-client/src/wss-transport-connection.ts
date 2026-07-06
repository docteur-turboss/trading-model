import { EventEmitter } from "events";

import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { WsAuthSender } from "./ws-auth-sender";
import { WsConnectionManager } from "./ws-connection-manager";
import { CertWsReconnectHandler } from "./ws-reconnect-handler";

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export class WssTransportConnection {
	private _emitter = new EventEmitter();
	private _state: ConnectionState = "disconnected";
	private readonly _connectionManager: WsConnectionManager;
	private readonly _reconnectHandler = new CertWsReconnectHandler();
	private readonly _authSender: WsAuthSender;

	on(event: string, listener: (...args: unknown[]) => void): this {
		this._emitter.on(event, listener);
		return this;
	}

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths,
		private readonly _bootstrapToken?: string
	) {
		this._connectionManager = new WsConnectionManager(this._url, tlsConfig);
		this._authSender = new WsAuthSender(this._bootstrapToken);
	}

	connect(): void {
		if (this._reconnectHandler.isDestroyed || this._state === "connected" || this._state === "connecting") {
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
		if (this._reconnectHandler.isDestroyed) {
			return;
		}
		this._state = "connecting";
		this._connectionManager.connect(
			() => {
				this._state = "connected";
				this._reconnectHandler.resetAttempt();
				this._authSender.send(this._connectionManager.ws);
				this._emitter.emit("open");
			},
			(data) => {
				this._emitter.emit("message", data);
			},
			() => {
				this._state = "disconnected";
				if (!this._reconnectHandler.isDestroyed) {
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
		this._state = "reconnecting";
		this._reconnectHandler.schedule(() => {
			this._connectionManager.cleanup();
			this._connectWs();
		});
	}

	disconnect(): void {
		this._connectionManager.cleanup();
		this._reconnectHandler.cancelTimer();
		this._state = "disconnected";
	}

	destroy(): void {
		this._reconnectHandler.destroy();
		this.disconnect();
	}
}
