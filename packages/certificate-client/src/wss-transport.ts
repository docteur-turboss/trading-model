import { randomUUID } from "node:crypto";

import type { SignCertificateResponse } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import WebSocket from "ws";

import { WssTransportConnection } from "./wss-transport-connection";

interface PendingRequest {
	resolve: (value: SignCertificateResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class CaWssTransport {
	private _wsAuthSent = false;
	private readonly _pending = new Map<string, PendingRequest>();
	private _destroyed = false;
	private _unauthRejects = 0;
	private readonly _connection: WssTransportConnection;

	constructor(
		wsUrl: string,
		tlsConfig?: import("@trading-model/common/domain/tls-paths").TlsPaths,
		bootstrapToken?: string
	) {
		this._connection = new WssTransportConnection(
			wsUrl,
			tlsConfig,
			bootstrapToken
		);
		this._connection.on("open", () => {
			this._wsAuthSent = false;
		});
		this._connection.on("message", (data: WebSocket.Data) =>
			this._onWsMessage(data)
		);
	}

	get isConnected(): boolean {
		return this._connection.state === "connected";
	}

	get isAuthSent(): boolean {
		return this._wsAuthSent;
	}

	get mode(): "wss" {
		return "wss";
	}

	// ── Message handling ───────────────────────────────────────────────────────

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

	// ── Public API ─────────────────────────────────────────────────────────────

	async signCertificate(
		serviceId: ServiceId,
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

			const ws = this._connection.ws;
			if (!isWsConnected(ws)) {
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
		this._connection.destroy();
		for (const [id, pending] of this._pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Transport destroyed"));
			this._pending.delete(id);
		}
	}

	// ── Cleanup ────────────────────────────────────────────────────────────────

	private _close(): void {
		this._connection.disconnect();
	}
}
