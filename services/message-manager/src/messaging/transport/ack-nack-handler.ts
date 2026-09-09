import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import type { Dispatcher } from "../core/dispatcher";
import type { WsTransportMessage } from "./wss-message.types";

export class AckNackHandler {
	constructor(private readonly _dispatcher: Dispatcher) {}

	handleAck(
		msg: WsTransportMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): void {
		if (typeof msg.messageId !== "string") {
			this._sendMessageIdError(ws);
			return;
		}
		this._dispatcher.handleAck(msg.messageId, ctx.identity.instanceId);
	}

	handleNack(
		msg: WsTransportMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): void {
		if (typeof msg.messageId !== "string") {
			this._sendMessageIdError(ws);
			return;
		}
		this._dispatcher.handleNack(msg.messageId, ctx.identity.instanceId);
	}

	private _sendMessageIdError(ws: WebSocket): void {
		ws.send(
			JSON.stringify({ type: "error", message: "messageId must be a string" })
		);
	}
}
