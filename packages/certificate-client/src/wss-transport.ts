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

type WsMessageHandler = (msg: Record<string, unknown>) => void;

export type NullCaWssTransport = typeof NULL_CA_WSS_TRANSPORT;

export const NULL_CA_WSS_TRANSPORT = {
	isConnected: false,
	isAuthSent: false,
	signCertificate: (): Promise<SignCertificateResponse> => {
		throw new Error("WSS transport not available");
	},
	destroy: () => {},
	disconnect: () => {},
};

export class CaWssTransport {
	private readonly _connection: WssTransportConnection;
	private readonly _pendingManager = new PendingRequestManager();
	private readonly _authHandler = new AuthHandler();
	private readonly _messageHandlers: Record<string, WsMessageHandler>;

	constructor(
		wsUrl: string,
		tlsConfig?: import("@trading-model/common/domain/tls-paths").TlsPaths,
		bootstrapToken?: string
	) {
		this._messageHandlers = {
			"auth:response": (msg) =>
				this._authHandler.handleResponse(msg, () => this._close()),
			"sign:response": (msg) => this._pendingManager.handleResponse(msg),
			response: (msg) => this._pendingManager.handleResponse(msg),
		};

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
			const handler = this._messageHandlers[msg.type as string];
			if (handler) {
				handler(msg);
			}
		} catch {
			logger.error("Invalid WSS message from CA");
		}
	}

	disconnect(): void {
		this._connection.disconnect();
		this._pendingManager.rejectAll(new Error("Transport disconnected"));
	}

	/** @deprecated Use {@link disconnect()} instead */
	destroy(): void {
		this.disconnect();
	}

	private _sendSignRequest(id: string, request: SignCertificateRequest): void {
		const ws = this._connection.ws;
		if (!isWsConnected(ws)) {
			this._pendingManager.cancel(id);
			throw new Error("WebSocket not connected");
		}
		ws.send(
			JSON.stringify({
				type: "sign",
				id,
				data: {
					serviceId: request.serviceId,
					csr: request.csr,
					ttlMs: request.ttlMs,
				},
			}),
			(err) => {
				if (err) {
					this._pendingManager.cancel(id, err);
				}
			}
		);
	}

	signCertificate(
		request: SignCertificateRequest
	): Promise<SignCertificateResponse> {
		const id = randomUUID();
		const promise = this._pendingManager.create(id);
		this._sendSignRequest(id, request);
		return promise;
	}

	private _close(): void {
		this._connection.disconnect();
	}
}
