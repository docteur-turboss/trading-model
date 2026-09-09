import type { Topic } from "@trading-model/common/domain/primitives";
import { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import { TopicSubscriptionHandler } from "./topic-subscription-handler";
import { WssBroadcaster } from "./wss-broadcaster";
import type { WsTransportMessage } from "./wss-message.types";

export interface WsSubscription {
	identity: ServiceIdentity;
	topics: Set<string>;
	ws: WebSocket;
}

export interface SubscriptionContext {
	ws: WebSocket;
	identity: ServiceIdentity;
	topics: Set<string>;
}

const MAX_CONNECTIONS = 10000;

export class WssSubscriptionManager {
	private readonly _subscriptions = new Map<string, WsSubscription>();
	private readonly _topicHandler = new TopicSubscriptionHandler();
	private readonly _broadcaster = new WssBroadcaster(this._subscriptions);

	get size(): number {
		return this._subscriptions.size;
	}

	get(identity: ServiceIdentity): WebSocket | undefined {
		return this._subscriptions.get(ServiceIdentity.toKey(identity))?.ws;
	}

	has(identity: ServiceIdentity): boolean {
		return this._subscriptions.has(ServiceIdentity.toKey(identity));
	}

	enforceCapacity(ws: WebSocket): boolean {
		if (this._subscriptions.size >= MAX_CONNECTIONS) {
			ws.close(1013, "Server at capacity — too many WSS connections");
			return false;
		}
		return true;
	}

	add(ctx: SubscriptionContext): string {
		const { ws, identity, topics } = ctx;
		const subKey = ServiceIdentity.toKey(identity);
		this._subscriptions.set(subKey, { identity, topics, ws });
		return subKey;
	}

	remove(subKey: string): void {
		this._subscriptions.delete(subKey);
	}

	handleSubscribe(msg: WsTransportMessage, ctx: SubscriptionContext): void {
		this._topicHandler.handleSubscribe(msg, ctx);
	}

	handleUnsubscribe(msg: WsTransportMessage, ctx: SubscriptionContext): void {
		this._topicHandler.handleUnsubscribe(msg, ctx);
	}

	broadcastToTopic(topic: Topic, message: unknown): number {
		return this._broadcaster.broadcastToTopic(topic, message);
	}

	broadcast(message: unknown): void {
		this._broadcaster.broadcast(message);
	}

	clear(): void {
		this._subscriptions.clear();
	}

	entries(): IterableIterator<[string, WsSubscription]> {
		return this._subscriptions.entries();
	}
}
