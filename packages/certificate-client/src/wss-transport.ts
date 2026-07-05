import { randomUUID } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import {
	createWsConnectTimeout,
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import WebSocket from "ws";

export interface SignCertificateResponse {
	certificate: string;
	serialNumber: string;
	expiresAt: string;
}

interface PendingRequest {
	resolve: (value: SignCertificateResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class WssTransport {
	private _ws: WebSocket | null = null;
	private _connected = false;
	private _authSent = false;
	private readonly _pending = new Map<string, PendingRequest>();
	private _reconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _destroyed = false;
	private _unauthRejects = 0;
	private _onFallback?: () => void;
	private _onReconnectScheduled?: () => void;

	constructor(
		private readonly _wsUrl: string,
		private readonly _tls?: { ca: string; cert: string; key: string },
		private readonly _bootstrapToken?: string
	) {}

	get isConnected(): boolean {
		return this._connected;
	}

	get isAuthSent(): boolean {
		return this._authSent;
	}

	set onFallback(cb: (() => void) | undefined) {
		this._onFallback = cb;
	}

	set onReconnectScheduled(cb: (() => void) | undefined) {
		this._onReconnectScheduled = cb;
	}

	connect(): void {
		if (this._destroyed) {
			return;
		}
		try {
			this._ws = new WebSocket(this._wsUrl, this._buildOptions());
			this._ws.binaryType = "nodebuffer";

			const cancelTimeout = createWsConnectTimeout(() => {
				if (!this._connected) {
					logger.warn("WSS connection timeout");
					this._ws?.close();
					this._scheduleReconnect();
				}
			}, 10_000);

			this._ws.on("open", () => this._onOpen(cancelTimeout));
			this._ws.on("message", (data) => this._onMessage(data));
			this._ws.on("close", () => this._onClose(cancelTimeout));
			this._ws.on("error", (err) => this._onError(err, cancelTimeout));
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

	destroy(): void {
		this._destroyed = true;
		this._reconnectState.destroyed = true;
		this._cleanup();
		if (this._reconnectState.timer) {
			clearTimeout(this._reconnectState.timer);
			this._reconnectState.timer = null;
		}
		for (const [id, pending] of this._pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("WssTransport destroyed"));
			this._pending.delete(id);
		}
	}

	private _buildOptions(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._tls) {
			opts.ca = this._tls.ca;
			opts.cert = this._tls.cert;
			opts.key = this._tls.key;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}

	private _onOpen(cancelTimeout: () => void): void {
		cancelTimeout();
		this._connected = true;
		this._authSent = false;
		this._reconnectState.attempt = 0;
		logger.info("WSS transport connected to CA");
		this._sendAuth();
	}

	private _sendAuth(): void {
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

	private _onMessage(data: WebSocket.Data): void {
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
			this._authSent = true;
			this._unauthRejects = 0;
			logger.info("WSS auth token delivered to CA");
		} else {
			logger.error("WSS auth message rejected by CA", {
				error: (msg.error as { message?: string })?.message,
			});
			this._onFallback?.();
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

	private _onClose(cancelTimeout: () => void): void {
		cancelTimeout();
		this._connected = false;
		if (!this._destroyed) {
			this._scheduleReconnect();
		}
	}

	private _onError(err: Error, cancelTimeout: () => void): void {
		cancelTimeout();
		logger.error("WSS transport error", { err: err.message });
		if (!this._connected) {
			this._scheduleReconnect();
		}
	}

	private _scheduleReconnect(): void {
		if (this._destroyed) {
			return;
		}
		this._onReconnectScheduled?.();
		scheduleWsReconnect(
			this._reconnectState,
			{ baseDelayMs: 1000, maxDelayMs: 60000, jitterMs: 500 },
			() => {
				this._cleanup();
				this.connect();
			},
			logger
		);
	}

	private _cleanup(): void {
		if (this._ws) {
			try {
				this._ws.removeAllListeners();
				this._ws.close();
			} catch {
				/* closing gracefully */
			}
			this._ws = null;
		}
		this._connected = false;
	}
}
