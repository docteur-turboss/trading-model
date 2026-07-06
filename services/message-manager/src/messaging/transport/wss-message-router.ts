import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import WebSocket from "ws";
import type { Dispatcher } from "../core/dispatcher";
import type { IncomingWssMessage, WssMessageType } from "./wss-message.types";
import { WssPublisher } from "./wss-publisher";
import { WssSubscriptionManager } from "./wss-subscription-manager";

type MessageHandler = (
	msg: IncomingWssMessage,
	ws: WebSocket,
	ctx: {
		identity: ServiceIdentity;
		topics: Set<string>;
		subKey: string;
	}
) => Promise<void> | void;

export class WssMessageRouter {
	constructor(
		private readonly _dispatcher: Dispatcher,
		private readonly _subscriptionManager: WssSubscriptionManager,
		private readonly _publisher: WssPublisher
	) {}

	registerMessageHandler(
		ws: WebSocket,
		ctx: {
			identity: ServiceIdentity;
			topics: Set<string>;
			subKey: string;
		}
	): void {
		ws.on("message", async (raw: WebSocket.RawData) => {
			const incoming = this.parseWsMessage(raw, ws);
			if (!incoming) {
				return;
			}

			const handler = this.buildHandlerMap().get(incoming.type);
			if (handler) {
				try {
					await handler(incoming, ws, ctx);
				} catch {
					ws.send(
						JSON.stringify({
							type: "error",
							message: "Server error processing message",
						})
					);
				}
			} else {
				ws.send(
					JSON.stringify({
						type: "error",
						message: `Unknown message type: ${incoming.type}`,
					})
				);
			}
		});
	}

	buildHandlerMap(): Map<WssMessageType, MessageHandler> {
		const map = new Map<WssMessageType, MessageHandler>();
		map.set("subscribe", (msg, ws, ctx) =>
			this._subscriptionManager.handleSubscribe(msg, { ws, ...ctx })
		);
		map.set("unsubscribe", (msg, ws, ctx) =>
			this._subscriptionManager.handleUnsubscribe(msg, { ws, ...ctx })
		);
		map.set("publish", (msg, ws, ctx) =>
			this._publisher.handlePublish(msg, ws, ctx)
		);
		map.set("ack", (msg, ws, ctx) => this.handleAck(msg, ws, ctx));
		map.set("nack", (msg, ws, ctx) => this.handleNack(msg, ws, ctx));
		return map;
	}

	parseWsMessage(
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
			instanceId: msg.instanceId as string | undefined,
			topics: msg.topics as string[] | undefined,
			payload: msg.payload,
			metadata: msg.metadata,
			traceparent: msg.traceparent as string | undefined,
			messageId: msg.messageId as string | undefined,
		};
	}

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
		this._dispatcher.handleAck(msg.messageId, ctx.identity.instanceId).catch(() => {});
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
		this._dispatcher.handleNack(msg.messageId, ctx.identity.instanceId).catch(() => {});
	}
}
