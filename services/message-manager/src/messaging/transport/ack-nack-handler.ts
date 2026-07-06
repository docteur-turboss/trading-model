import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import type { Dispatcher } from "../core/dispatcher";
import type { IncomingWssMessage } from "./wss-message.types";

export class AckNackHandler {
	constructor(private readonly _dispatcher: Dispatcher) {}

	handleAck(
		msg: IncomingWssMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): void {
		if (typeof msg.messageId !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "messageId must be a string" })
			);
			return;
		}
		this._dispatcher
			.handleAck(msg.messageId, ctx.identity.instanceId)
			.catch(() => {});
	}

	handleNack(
		msg: IncomingWssMessage,
		ws: WebSocket,
		ctx: { identity: ServiceIdentity }
	): void {
		if (typeof msg.messageId !== "string") {
			ws.send(
				JSON.stringify({ type: "error", message: "messageId must be a string" })
			);
			return;
		}
		this._dispatcher
			.handleNack(msg.messageId, ctx.identity.instanceId)
			.catch(() => {});
	}
}
