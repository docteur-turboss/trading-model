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
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
			return null;
		}
		if (typeof msg.type !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "Missing message type" })
			);
			return null;
		}

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
