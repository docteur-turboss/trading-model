import type {
	AuthToken,
	CsrPem,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import type { RawData, WebSocket } from "ws";
import { sendJsonError } from "./ws-response-formatter";
import type { WssSession } from "./ws-sign-handler";

export enum WsMessageType {
	Auth = "auth",
	AuthResponse = "auth:response",
	Sign = "sign",
	SignResponse = "sign:response",
}

export interface CaAuthMessage {
	type: WsMessageType.Auth;
	token: AuthToken;
}

export interface CaSignMessage {
	type: WsMessageType.Sign;
	id: string;
	data: {
		serviceId: ServiceId;
		csr: CsrPem;
		ttlMs?: number;
	};
}

export type CaClientMessage = CaAuthMessage | CaSignMessage;

export interface WsMessageHandler {
	readonly type: WsMessageType;
	handle(
		ws: WebSocket,
		msg: CaClientMessage,
		session: WssSession
	): Promise<void> | void;
}

export class WsMessageRouter {
	private readonly _handlers = new Map<WsMessageType, WsMessageHandler>();

	register(handler: WsMessageHandler): void {
		this._handlers.set(handler.type, handler);
	}

	async dispatch(
		ws: WebSocket,
		raw: RawData,
		session: WssSession
	): Promise<void> {
		const msg = _parseWsMessage(raw);
		if (!msg) {
			sendJsonError(ws, "Invalid JSON");
			return;
		}

		const handler = this._handlers.get(msg.type);
		if (!handler) {
			sendJsonError(ws, `Unknown message type: ${msg.type}`);
			return;
		}

		await handler.handle(ws, msg, session);
	}
}

function _parseWsMessage(raw: RawData): CaClientMessage | null {
	try {
		return JSON.parse(raw.toString()) as CaClientMessage;
	} catch {
		return null;
	}
}
