import {
	type Topic,
	toInstanceId,
	toMessageId,
} from "@trading-model/common/domain/primitives";
import type WebSocket from "ws";
import type { IncomingWssMessage, WssMessageType } from "./wss-message.types";

export class WssMessageParser {
	static parse(
		raw: WebSocket.RawData,
		ws: WebSocket
	): IncomingWssMessage | null {
		const msg = WssMessageParser._tryParseJson(raw, ws);
		if (!msg) {
			return null;
		}
		if (!WssMessageParser._validateType(msg, ws)) {
			return null;
		}
		return WssMessageParser._mapToIncoming(msg);
	}

	private static _tryParseJson(
		raw: WebSocket.RawData,
		ws: WebSocket
	): Record<string, unknown> | null {
		try {
			return JSON.parse(raw.toString()) as Record<string, unknown>;
		} catch {
			ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
			return null;
		}
	}

	private static _validateType(
		msg: Record<string, unknown>,
		ws: WebSocket
	): boolean {
		if (typeof msg.type === "string") {
			return true;
		}
		ws.send(
			JSON.stringify({ type: "error", message: "Missing message type" })
		);
		return false;
	}

	private static _mapToIncoming(
		msg: Record<string, unknown>
	): IncomingWssMessage {
		return {
			type: msg.type as WssMessageType,
			instanceId: msg.instanceId
				? toInstanceId(msg.instanceId as string)
				: undefined,
			topics: msg.topics as Topic[] | undefined,
			payload: msg.payload,
			metadata: msg.metadata,
			traceparent: msg.traceparent as string | undefined,
			messageId: msg.messageId
				? toMessageId(msg.messageId as string)
				: undefined,
		};
	}
}
