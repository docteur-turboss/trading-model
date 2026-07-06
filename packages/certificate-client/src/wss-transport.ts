import { randomUUID } from "node:crypto";

import type { SignCertificateResponse } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import {
	createWsConnectTimeout,
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import WebSocket from "ws";

interface PendingRequest {
	resolve: (value: SignCertificateResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class WssTransport {
	private _ws: WebSocket | null = null;
	private _wsConnected = false;
	private _wsAuthSent = false;
	private readonly _pending = new Map<string, PendingRequest>();
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _destroyed = false;
	private _unauthRejects = 0;

	constructor(
		private readonly _wsUrl: string,
		private readonly _tlsConfig?: { ca: string; cert: string; key: string },
		private readonly _bootstrapToken?: string
	) {
		this._connectWs();
	}

	get isConnected(): boolean {
		return this._wsConnected;
	}

	get isAuthSent(): boolean {
		return this._wsAuthSent;
	}

	get mode(): "wss" {
		return "wss";
	}

	private _buildWsOptions(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tlsConfig) {
			opts.ca = this._tlsConfig.ca;
			opts.cert = this._tlsConfig.cert;
			opts.key = this._tlsConfig.key;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}

	private _sendWsAuth(): void {
		const token = this._bootstrapToken;
		if (
			!token ||
			token.length === 0 ||
			!this._ws ||
			this._ws.readyState !== WebSocket.OPEN
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

	private _onWsOpen(cancelTimeout: () => void): void {
		cancelTimeout();
		this._wsConnected = true;
		this._wsAuthSent = false;
		this._wsReconnectState.attempt = 0;
		logger.info("WSS transport connected to CA");
		this._sendWsAuth();
	}

	private _onWsMessage(data: WebSocket.Data): void {
		try {
			const msg = JSON.parse(data.toString());
			if (msg.type === "auth:response") {
				this._handleAuthResponse(msg);
				return;
			}
			if (msg.type === "sign:response" || msg.type === "response") {
				this._handleSignResponse(msg);
			}
		} catch {
			logger.error("Invalid WSS message from CA");
		}
	}

	private _handleAuthResponse(msg: Record<string, unknown>): void {
		if (msg.success) {
			this._wsAuthSent = true;
			this._unauthRejects = 0;
			logger.info("WSS auth token delivered to CA");
		} else {
			logger.error("WSS auth message rejected by CA", {
				error: (msg.error as { message?: string })?.message,
			});
			this._close();
		}
	}

	private _handleSignResponse(msg: Record<string, unknown>): void {
		const pending = this._pending.get(msg.id as string);
		if (pending) {
			clearTimeout(pending.timer);
			this._pending.delete(msg.id as string);
			if (msg.success) {
				pending.resolve(msg.data as SignCertificateResponse);
			} else {
				pending.reject(
					new Error(
						(msg.error as { message?: string })?.message ?? "WSS request failed"
					)
				);
			}
		}
	}

	private _onWsClose(cancelTimeout: () => void): void {
		cancelTimeout();
		this._wsConnected = false;
		if (!this._destroyed) {
			this._scheduleReconnect();
		}
	}

	private _onWsError(err: Error, cancelTimeout: () => void): void {
		cancelTimeout();
		logger.error("WSS transport error", { err: err.message });
		if (!this._wsConnected) {
			this._scheduleReconnect();
		}
	}

	private _scheduleReconnect(): void {
		if (this._destroyed) {
			return;
		}
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

	private _connectWs(): void {
		if (this._destroyed) {
			return;
		}
		try {
			this._ws = new WebSocket(this._wsUrl, this._buildWsOptions());
			this._ws.binaryType = "nodebuffer";

			const cancelTimeout = createWsConnectTimeout(() => {
				if (!this._wsConnected) {
					logger.warn("WSS connection timeout");
					this._ws?.close();
					this._scheduleReconnect();
				}
			}, 10_000);

			this._ws.on("open", () => this._onWsOpen(cancelTimeout));
			this._ws.on("message", (data) => this._onWsMessage(data));
			this._ws.on("close", () => this._onWsClose(cancelTimeout));
			this._ws.on("error", (err) => this._onWsError(err, cancelTimeout));
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			this._scheduleReconnect();
		}
	}

	async signCertificate(
		serviceId: string,
		csr: string,
		options?: { ttlMs?: number }
	): Promise<SignCertificateResponse> {
		const id = randomUUID();
		return new Promise<SignCertificateResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pending.delete(id);
				reject(new Error("WSS request timed out"));
			}, 30_000);

			this._pending.set(id, { resolve, reject, timer });

			const ws = this._ws;
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				clearTimeout(timer);
				this._pending.delete(id);
				reject(new Error("WebSocket not connected"));
				return;
			}

			ws.send(
				JSON.stringify({
					type: "sign",
					id,
					data: { serviceId, csr, ttlMs: options?.ttlMs },
				}),
				(err) => {
					if (err) {
						clearTimeout(timer);
						this._pending.delete(id);
						reject(err);
					}
				}
			);
		});
	}

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
		this._wsConnected = false;
	}

	private _close(): void {
		this._cleanupWs();
		this._wsConnected = false;
	}

	destroy(): void {
		this._destroyed = true;
		this._wsReconnectState.destroyed = true;
		this._cleanupWs();
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
		for (const [id, pending] of this._pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Transport destroyed"));
			this._pending.delete(id);
		}
	}
}
