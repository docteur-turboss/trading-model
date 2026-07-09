import { EventEmitter } from "node:events";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { DefaultWsReconnector } from "@trading-model/common/ws/default-ws-reconnector";
import type { IWsConnection } from "@trading-model/common/ws/i-ws-connection";
import { WsAuthSender } from "./ws-auth-sender";
import { WsTransport } from "./ws-transport";

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export class WssTransportConnection implements IWsConnection {
	private _emitter = new EventEmitter();
	private _state: ConnectionState = "disconnected";
	private readonly _connectionManager: WsTransport;
	private readonly _reconnectHandler = new DefaultWsReconnector({
		onReconnect: () => {
			this._connectionManager.disconnect();
			this._connectWs();
		},
	});
	private readonly _authSender: WsAuthSender;

	constructor(
		private readonly _url: string,
		tlsConfig?: TlsPaths,
		private readonly _bootstrapToken?: string
	) {
		this._connectionManager = new WsTransport(this._url, tlsConfig);
		this._authSender = new WsAuthSender(this._bootstrapToken);
	}

	connect(): void {
		if (
			this._reconnectHandler.isDestroyed ||
			this._state === "connected" ||
			this._state === "connecting"
		) {
			return;
		}
		this._connectWs();
	}
	get state(): ConnectionState {
		return this._state;
	}
	get isConnected(): boolean {
		return this._state === "connected";
	}
	get ws() {
		return this._connectionManager.ws;
	}

	on(event: string, listener: (...args: unknown[]) => void): this {
		this._emitter.on(event, listener);
		return this;
	}

	private _connectWs(): void {
		if (this._reconnectHandler.isDestroyed) {
			return;
		}
		this._state = "connecting";
		this._connectionManager.onOpen = () => this._onWsOpen();
		this._connectionManager.onMessage = (data) => {
			this._emitter.emit("message", data);
		};
		this._connectionManager.onCloseHandler = () => this._onWsClose();
		this._connectionManager.onError = (err) => this._onWsError(err);
		this._connectionManager.onTimeout = () => this._scheduleReconnect();
		this._connectionManager.connect();
	}
	private _onWsOpen(): void {
		this._state = "connected";
		this._reconnectHandler.reset();
		this._authSender.send(this._connectionManager.ws);
		this._emitter.emit("open");
	}
	private _onWsClose(): void {
		this._state = "disconnected";
		if (!this._reconnectHandler.isDestroyed) {
			this._scheduleReconnect();
		}
		this._emitter.emit("close");
	}
	private _onWsError(err: Error): void {
		if (
			!this._connectionManager.ws ||
			this._connectionManager.ws.readyState !== this._connectionManager.ws.OPEN
		) {
			this._scheduleReconnect();
		}
		this._emitter.emit("error", err);
	}
	private _scheduleReconnect(): void {
		this._state = "reconnecting";
		this._reconnectHandler.scheduleReconnect(() => {
			this._connectionManager.disconnect();
			this._connectWs();
		});
	}

	send(data: unknown): boolean {
		const ws = this._connectionManager.ws;
		if (!ws || ws.readyState !== ws.OPEN) {
			return false;
		}
		try {
			ws.send(typeof data === "string" ? data : JSON.stringify(data));
			return true;
		} catch {
			return false;
		}
	}

	disconnect(closeCode?: number, reason?: string): void {
		this._connectionManager.disconnect(closeCode, reason);
		this._reconnectHandler.cancel();
		this._state = "disconnected";
	}
}
