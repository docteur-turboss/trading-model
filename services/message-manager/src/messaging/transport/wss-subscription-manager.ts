import type { Topic } from "@trading-model/common/domain/primitives";
import { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import WebSocket from "ws";
import { TopicSubscriptionHandler } from "./topic-subscription-handler";
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
	private _subscriptions = new Map<string, WsSubscription>();
	private readonly _topicHandler = new TopicSubscriptionHandler();

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
		const payload = JSON.stringify({ type: "message", topic, message });
		let count = 0;
		for (const [key, sub] of [...this._subscriptions]) {
			if (this._isSubscribedToTopic(sub, topic)) {
				count += this._trySendAndTrack(key, sub, payload) ? 1 : 0;
			}
		}
		return count;
	}

	broadcast(message: unknown): void {
		const payload = JSON.stringify(message);
		for (const [key, sub] of [...this._subscriptions]) {
			this._trySend(key, sub, payload);
		}
	}

	private _isSubscribedToTopic(sub: WsSubscription, topic: Topic): boolean {
		return sub.topics.has(topic) && sub.ws.readyState === WebSocket.OPEN;
	}

	private _trySendAndTrack(
		key: string,
		sub: WsSubscription,
		payload: string
	): boolean {
		try {
			sub.ws.send(payload);
			return true;
		} catch {
			this._subscriptions.delete(key);
			return false;
		}
	}

	private _trySend(key: string, sub: WsSubscription, payload: string): void {
		if (sub.ws.readyState !== WebSocket.OPEN) {
			return;
		}
		try {
			sub.ws.send(payload);
		} catch {
			this._subscriptions.delete(key);
		}
	}

	clear(): void {
		this._subscriptions.clear();
	}

	entries(): IterableIterator<[string, WsSubscription]> {
		return this._subscriptions.entries();
	}
}
