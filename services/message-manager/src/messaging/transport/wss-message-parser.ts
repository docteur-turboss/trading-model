import {
	Topic,
	toInstanceId,
	toMessageId,
} from "@trading-model/common/domain/primitives";
import type WebSocket from "ws";
import type {
	TransportMessageType,
	WsTransportMessage,
} from "./wss-message.types";

export const WssMessageParser = {
	parse(raw: WebSocket.RawData, ws: WebSocket): WsTransportMessage | null {
		const msg = this._tryParseJson(raw, ws);
		if (!msg) {
			return null;
		}
		if (!this._validateType(msg, ws)) {
			return null;
		}
		return this._mapToIncoming(msg);
	},

	_tryParseJson(
		raw: WebSocket.RawData,
		ws: WebSocket
	): Record<string, unknown> | null {
		try {
			return JSON.parse(raw.toString()) as Record<string, unknown>;
		} catch {
			ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
			return null;
		}
	},

	_validateType(msg: Record<string, unknown>, ws: WebSocket): boolean {
		if (typeof msg.type === "string") {
			return true;
		}
		ws.send(JSON.stringify({ type: "error", message: "Missing message type" }));
		return false;
	},

	_mapToIncoming(msg: Record<string, unknown>): WsTransportMessage {
		return {
			type: msg.type as TransportMessageType,
			instanceId: msg.instanceId
				? toInstanceId(msg.instanceId as string)
				: undefined,
			topics: Array.isArray(msg.topics)
				? (msg.topics as string[]).map(Topic.of)
				: undefined,
			payload: msg.payload,
			metadata: msg.metadata,
			traceparent: msg.traceparent as string | undefined,
			messageId:
				msg.messageId && typeof msg.messageId === "string"
					? toMessageId(msg.messageId as string)
					: undefined,
		};
	},
};
