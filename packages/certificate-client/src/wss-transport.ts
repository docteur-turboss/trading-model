import { randomUUID } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { isWsConnected } from "@trading-model/common/domain/ws-connection";
import type {
	SignCertificateRequest,
	SignCertificateResponse,
} from "@trading-model/crypto/ca/ca-client";
import {
	AuthHandler,
	type CaAuthResponse,
	CaWssMessageType,
} from "./auth-handler";
import {
	type CaSignResponse,
	PendingRequestManager,
} from "./pending-request-manager";
import {
	type WssTransportConfig,
	WssTransportConnection,
} from "./wss-transport-connection";

type CaWssMessage = CaAuthResponse | CaSignResponse;

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

	constructor(config: WssTransportConfig) {
		this._connection = new WssTransportConnection(config);
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

	private readonly _messageHandlers: Partial<
		Record<CaWssMessageType, (msg: CaWssMessage) => void>
	> = {
		[CaWssMessageType.AuthResponse]: (msg) =>
			this._authHandler.handleResponse(msg as CaAuthResponse, () =>
				this._close()
			),
		[CaWssMessageType.SignResponse]: (msg) =>
			this._pendingManager.handleResponse(msg as CaSignResponse),
		[CaWssMessageType.Response]: (msg) =>
			this._pendingManager.handleResponse(msg as CaSignResponse),
	};

	private _onWsMessage(data: import("ws").Data): void {
		try {
			const msg = JSON.parse(data.toString()) as CaWssMessage;
			this._messageHandlers[msg.type]?.(msg);
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
