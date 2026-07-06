import { randomUUID } from "node:crypto";

import type {
	SignCertificateRequest,
	SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import { AuthHandler } from "./auth-handler";
import { PendingRequestManager } from "./pending-request-manager";
import { WssTransportConnection } from "./wss-transport-connection";

export class NullCaWssTransport {
	get isConnected(): boolean {
		return false;
	}

	get isAuthSent(): boolean {
		return false;
	}

	async signCertificate(): Promise<SignCertificateResponse> {
		throw new Error("WSS transport not available");
	}

	destroy(): void {}
}

export class CaWssTransport {
	private readonly _connection: WssTransportConnection;
	private readonly _pendingManager = new PendingRequestManager();
	private readonly _authHandler = new AuthHandler();

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
			this._authHandler.reset();
		});
		this._connection.on("message", (data) =>
			this._onWsMessage(data as import("ws").Data)
		);
		this._connection.connect();
	}

	get isConnected(): boolean {
		return this._connection.state === "connected";
	}

	get isAuthSent(): boolean {
		return this._authHandler.isAuthSent;
	}

	get mode(): "wss" {
		return "wss";
	}

	private _onWsMessage(data: import("ws").Data): void {
		try {
			const msg = JSON.parse(data.toString());
			if (msg.type === "auth:response") {
				this._authHandler.handleResponse(msg, () => this._close());
				return;
			}
			if (msg.type === "sign:response" || msg.type === "response") {
				this._pendingManager.handleResponse(msg);
			}
		} catch {
			logger.error("Invalid WSS message from CA");
		}
	}

	disconnect(): void {
		this.destroy();
	}

	async signCertificate(
		request: SignCertificateRequest
	): Promise<SignCertificateResponse> {
		const { serviceId, csr, ttlMs } = request;
		const id = randomUUID();
		const promise = this._pendingManager.create(id);

		const ws = this._connection.ws;
		if (!isWsConnected(ws)) {
			this._pendingManager.cancel(id);
			throw new Error("WebSocket not connected");
		}

		ws.send(
			JSON.stringify({
				type: "sign",
				id,
				data: { serviceId, csr, ttlMs },
			}),
			(err) => {
				if (err) {
					this._pendingManager.cancel(id, err);
				}
			}
		);

		return promise;
	}

	destroy(): void {
		this._destroyed = true;
		this._connection.destroy();
		this._pendingManager.rejectAll(new Error("Transport destroyed"));
	}

	private _close(): void {
		this._connection.disconnect();
	}
}
