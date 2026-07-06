import WebSocket from "ws";
import { EventEmitter } from "events";

import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import {
	createWsConnectTimeout,
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export class WssTransportConnection {
	private _emitter = new EventEmitter();
	private _ws: WebSocket | null = null;
	private _state: ConnectionState = "disconnected";
	private _destroyed = false;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};

	on(event: string, listener: (...args: unknown[]) => void): this {
		this._emitter.on(event, listener);
		return this;
	}

	constructor(
		private readonly _url: string,
		private readonly _tlsConfig?: TlsPaths,
		private readonly _bootstrapToken?: string
	) {
		this._connectWs();
	}

	get state(): ConnectionState {
		return this._state;
	}

	get ws(): WebSocket | null {
		return this._ws;
	}

	private _buildWsOptions(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tlsConfig) {
			opts.ca = this._tlsConfig.caPath;
			opts.cert = this._tlsConfig.certPath;
			opts.key = this._tlsConfig.keyPath;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}

	// ── Connection lifecycle ───────────────────────────────────────────────────

	private _setupConnectTimeout(): () => void {
		return createWsConnectTimeout(() => {
			if (this._state !== "connected") {
				logger.warn("WSS connection timeout");
				if (this._ws) {
					this._ws.close();
				}
				this._scheduleReconnect();
			}
		}, 10_000);
	}

	private _registerWsEventHandlers(cancelTimeout: () => void): void {
		if (!this._ws) return;

		this._ws.on("open", () => {
			cancelTimeout();
			this._state = "connected";
			this._wsReconnectState.attempt = 0;
			logger.info("WSS transport connected to CA");
			this._sendWsAuth();
			this._emitter.emit("open");
		});

		this._ws.on("message", (data: WebSocket.Data) => {
			this._emitter.emit("message", data);
		});

		this._ws.on("close", () => {
			cancelTimeout();
			this._state = "disconnected";
			if (!this._destroyed) {
				this._scheduleReconnect();
			}
			this._emitter.emit("close");
		});

		this._ws.on("error", (err: Error) => {
			cancelTimeout();
			logger.error("WSS transport error", { err: err.message });
			if (!isWsConnected(this._ws)) {
				this._scheduleReconnect();
			}
			this._emitter.emit("error", err);
		});
	}

	private _connectWs(): void {
		if (this._destroyed) {
			return;
		}
		this._state = "connecting";
		try {
			this._ws = new WebSocket(this._url, this._buildWsOptions());
			this._ws.binaryType = "nodebuffer";

			const cancelTimeout = this._setupConnectTimeout();
			this._registerWsEventHandlers(cancelTimeout);
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			this._scheduleReconnect();
		}
	}

	private _sendWsAuth(): void {
		const token = this._bootstrapToken;
		if (
			!token ||
			token.length === 0 ||
			!isWsConnected(this._ws)
		) {
			return;
		}
		this._ws.send(
			JSON.stringify({
				type: "auth",
				token,
			}),
			(err) => {
				if (err) {
					logger.error("Failed to send WSS auth message", { err: err.message });
				}
			}
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
				this._cleanupWs();
				this._connectWs();
			},
			logger,
		});
	}

	// ── Cleanup ────────────────────────────────────────────────────────────────

	private _cleanupWs(): void {
		if (this._ws) {
			try {
				this._ws.removeAllListeners();
				this._ws.close();
			} catch {
				/* closing gracefully */
			}
			this._ws = null;
		}
	}

	disconnect(): void {
		this._cleanupWs();
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
