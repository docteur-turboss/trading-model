import type { Topic } from "@trading-model/common/domain/primitives";
import WebSocket from "ws";
import type { WsSubscription } from "./wss-subscription-manager";

export class WssBroadcaster {
	constructor(private readonly _subscriptions: Map<string, WsSubscription>) {}

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
}
