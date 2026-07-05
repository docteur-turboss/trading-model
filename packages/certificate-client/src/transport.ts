import { randomUUID } from "node:crypto";
import {
	CaClient,
	type SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import {
	createWsConnectTimeout,
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import WebSocket from "ws";

export type TransportMode = "wss" | "https";

export interface TransportConfig {
	caUrl: string;
	tls?: {
		ca: string;
		cert: string;
		key: string;
	};
	retestWssIntervalMs?: number;
	forceHttps?: boolean;
	bootstrapToken?: string;
}

interface PendingRequest {
	resolve: (value: SignCertificateResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class TransportManager {
	private _mode: TransportMode;
	private _ws: WebSocket | null = null;
	private _wsConnected = false;
	/** Whether the auth token has been delivered to the CA server.
	 *  NOTE: this means "token delivered", NOT "token validated". */
	private _wsAuthSent = false;
	private readonly _httpsClient: CaClient;
	private readonly _config: TransportConfig;
	private readonly _baseUrl: string;
	private readonly _pending = new Map<string, PendingRequest>();
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _destroyed = false;
	/** Number of unauthenticated requests rejected — used for rate-limit backpressure. */
	private _unauthRejects = 0;

	constructor(config: TransportConfig) {
		this._config = config;
		this._baseUrl = config.caUrl.replace(/\/+$/, "");
		this._httpsClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		if (config.forceHttps) {
			this._mode = "https";
		} else {
			this._mode = "wss";
			this._connectWs();
		}
	}

	get currentMode(): TransportMode {
		return this._mode;
	}

	private _getWsUrl(): string {
		return this._baseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
	}

	/**
	 * Sends the bootstrap token as a dedicated auth message over the WSS connection.
	 * This is more secure than including the token in the HTTP Upgrade header,
	 * which would be visible in load balancer / proxy logs.
	 */
	private _sendWsAuth(): void {
		const token = this._config.bootstrapToken;
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

	private _buildWsOptions(): WebSocket.ClientOptions {
		const opts: WebSocket.ClientOptions = {};
		if (this._config.tls) {
			opts.ca = this._config.tls.ca;
			opts.cert = this._config.tls.cert;
			opts.key = this._config.tls.key;
			opts.rejectUnauthorized = true;
		}
		opts.minVersion = "TLSv1.3";
		opts.ciphers =
			"TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256";
		return opts;
	}

	private _onWsOpen(cancelTimeout: () => void): void {
		cancelTimeout();
		this._wsConnected = true;
		this._wsAuthSent = false;
		this._wsReconnectState.attempt = 0;
		this._mode = "wss";
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
			this._mode = "https";
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
		if (this._mode === "wss" && !this._destroyed) {
			this._scheduleWsReconnect();
		}
	}

	private _onWsError(err: Error, cancelTimeout: () => void): void {
		cancelTimeout();
		logger.error("WSS transport error", { err: err.message });
		if (!this._wsConnected) {
			this._scheduleWsReconnect();
		}
	}

	private _connectWs(): void {
		if (this._destroyed) {
			return;
		}
		try {
			const wsUrl = this._getWsUrl();
			this._ws = new WebSocket(wsUrl, this._buildWsOptions());
			this._ws.binaryType = "nodebuffer";

			const cancelTimeout = createWsConnectTimeout(() => {
				if (!this._wsConnected) {
					logger.warn("WSS connection timeout");
					this._ws?.close();
					this._scheduleWsReconnect();
				}
			}, 10_000);

			this._ws.on("open", () => this._onWsOpen(cancelTimeout));
			this._ws.on("message", (data) => this._onWsMessage(data));
			this._ws.on("close", () => this._onWsClose(cancelTimeout));
			this._ws.on("error", (err) => this._onWsError(err, cancelTimeout));
		} catch (err) {
			logger.error("Failed to create WSS connection", { err });
			this._scheduleWsReconnect();
		}
	}

	private _scheduleWsReconnect(): void {
		if (this._destroyed) {
			return;
		}
		this._mode = "https";
		scheduleWsReconnect(
			this._wsReconnectState,
			{ baseDelayMs: 1000, maxDelayMs: 60000, jitterMs: 500 },
			() => {
				this._cleanupWs();
				this._connectWs();
			},
			logger
		);
	}

	private _sendWsRequest(
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

	async signCertificate(
		serviceId: string,
		csr: string,
		options?: { ttlMs?: number }
	): Promise<SignCertificateResponse> {
		if (
			this._mode === "wss" &&
			this._wsConnected &&
			this._ws?.readyState === WebSocket.OPEN
		) {
			// 5a: Only send via WSS if authenticated (tokens sent post-connect, not in Upgrade header)
			// 5c: If not yet authenticated, fall back to HTTPS to avoid abuse
			if (!this._wsAuthSent) {
				this._unauthRejects++;
				if (this._unauthRejects > 3) {
					logger.warn(
						"WSS not authenticated after 3 attempts, falling back to HTTPS"
					);
					this._mode = "https";
					this._scheduleWsReconnect();
					return this._httpsClient.signCertificate(serviceId, csr, options);
				}
			}
			try {
				return await this._sendWsRequest(serviceId, csr, options);
			} catch (err) {
				logger.error("WSS sign failed, falling back to HTTPS", { err });
				this._scheduleWsReconnect();
			}
		}
		return this._httpsClient.signCertificate(serviceId, csr, options);
	}

	async getCertificate(
		serviceId: string
	): Promise<
		import("@trading-model/common/ca/ca-client").GetCertificateResponse | null
	> {
		return await this._httpsClient.getCertificate(serviceId);
	}

	async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
		return await this._httpsClient.revokeCertificate(serialNumber, reason);
	}

	async getCrl(since?: string): Promise<
		Array<{
			serialNumber: string;
			serviceId: string;
			revokedAt: string;
			reason: string;
		}>
	> {
		return await this._httpsClient.getCrl(since);
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
			pending.reject(new Error("TransportManager destroyed"));
			this._pending.delete(id);
		}
	}
}
