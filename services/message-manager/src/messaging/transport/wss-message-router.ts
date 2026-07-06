import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import type { Dispatcher } from "../core/dispatcher";
import { AckNackHandler } from "./ack-nack-handler";
import type { IncomingWssMessage, WssMessageType } from "./wss-message.types";
import { WssMessageParser } from "./wss-message-parser";
import type { WssPublisher } from "./wss-publisher";
import type { WssSubscriptionManager } from "./wss-subscription-manager";

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
	private readonly _ackNackHandler: AckNackHandler;

	constructor(
		private readonly _dispatcher: Dispatcher,
		private readonly _subscriptionManager: WssSubscriptionManager,
		private readonly _publisher: WssPublisher
	) {
		this._ackNackHandler = new AckNackHandler(this._dispatcher);
	}

	registerMessageHandler(
		ws: WebSocket,
		ctx: {
			identity: ServiceIdentity;
			topics: Set<string>;
			subKey: string;
		}
	): void {
		ws.on("message", async (raw: WebSocket.RawData) => {
			const incoming = WssMessageParser.parse(raw, ws);
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
		map.set("ack", (msg, ws, ctx) =>
			this._ackNackHandler.handleAck(msg, ws, ctx)
		);
		map.set("nack", (msg, ws, ctx) =>
			this._ackNackHandler.handleNack(msg, ws, ctx)
		);
		return map;
	}
}
