import type { RawData, WebSocket } from "ws";
import { sendJsonError } from "./ws-response-formatter";
import type { WssSession } from "./ws-sign-handler";

export enum WsMessageType {
	Auth = "auth",
	Sign = "sign",
}

export interface WsMessageHandler {
	readonly type: WsMessageType;
	handle(
		ws: WebSocket,
		msg: Record<string, unknown>,
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

		const handler = this._handlers.get(msg.type as WsMessageType);
		if (!handler) {
			sendJsonError(ws, `Unknown message type: ${String(msg.type)}`);
			return;
		}

		await handler.handle(ws, msg, session);
	}
}

function _parseWsMessage(raw: RawData): Record<string, unknown> | null {
	try {
		return JSON.parse(raw.toString()) as Record<string, unknown>;
	} catch {
		return null;
	}
}
