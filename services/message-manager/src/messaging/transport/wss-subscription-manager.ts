import WebSocket from "ws";
import type { IncomingWssMessage } from "./wss-message.types";

interface WsSubscription {
	instanceId: string;
	serviceName: string;
	topics: Set<string>;
	ws: WebSocket;
}

export interface SubscriptionContext {
	ws: WebSocket;
	serviceName: string;
	instanceId: string;
	topics: Set<string>;
}

const MAX_CONNECTIONS = 10000;

export class WssSubscriptionManager {
	private _subscriptions = new Map<string, WsSubscription>();

	get size(): number {
		return this._subscriptions.size;
	}

	get(serviceName: string, instanceId: string): WebSocket | undefined {
		return this._subscriptions.get(`${serviceName}:${instanceId}`)?.ws;
	}

	has(serviceName: string, instanceId: string): boolean {
		return this._subscriptions.has(`${serviceName}:${instanceId}`);
	}

	enforceCapacity(ws: WebSocket): boolean {
		if (this._subscriptions.size >= MAX_CONNECTIONS) {
			ws.close(1013, "Server at capacity — too many WSS connections");
			return false;
		}
		return true;
	}

	add(ctx: SubscriptionContext): string {
		const { ws, serviceName, instanceId, topics } = ctx;
		const subKey = `${serviceName}:${instanceId}`;
		this._subscriptions.set(subKey, { instanceId, serviceName, topics, ws });
		return subKey;
	}

	remove(subKey: string): void {
		this._subscriptions.delete(subKey);
	}

	handleSubscribe(
		msg: IncomingWssMessage,
		ctx: SubscriptionContext
	): void {
		const { ws, topics, instanceId } = ctx;
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== instanceId) {
			ws.send(
				JSON.stringify({ type: "error", message: "instanceId mismatch" })
			);
			return;
		}
		const rawTopics = msg.topics;
		if (
			!(
				Array.isArray(rawTopics) &&
				rawTopics.every((topic) => typeof topic === "string")
			)
		) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "topics must be an array of strings",
				})
			);
			return;
		}
		for (const topic of rawTopics as string[]) {
			topics.add(topic);
		}
		ws.send(JSON.stringify({ type: "subscribed", topics: [...topics] }));
	}

	handleUnsubscribe(
		msg: IncomingWssMessage,
		ctx: SubscriptionContext
	): void {
		const { ws, topics, instanceId } = ctx;
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== instanceId) {
			ws.send(
				JSON.stringify({ type: "error", message: "instanceId mismatch" })
			);
			return;
		}
		const rawTopics = msg.topics;
		if (
			!(
				Array.isArray(rawTopics) &&
				rawTopics.every((topic) => typeof topic === "string")
			)
		) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "topics must be an array of strings",
				})
			);
			return;
		}
		for (const topic of rawTopics as string[]) {
			topics.delete(topic);
		}
		ws.send(JSON.stringify({ type: "unsubscribed", topics: [...topics] }));
	}

	broadcastToTopic(topic: string, message: unknown): number {
		let count = 0;
		const payload = JSON.stringify({ type: "message", topic, message });
		const entries = [...this._subscriptions];
		for (const [key, sub] of entries) {
			if (sub.topics.has(topic) && sub.ws.readyState === WebSocket.OPEN) {
				try {
					sub.ws.send(payload);
					count++;
				} catch {
					this._subscriptions.delete(key);
				}
			}
		}
		return count;
	}

	broadcast(message: unknown): void {
		const payload = JSON.stringify(message);
		const entries = [...this._subscriptions];
		for (const [key, sub] of entries) {
			if (sub.ws.readyState === WebSocket.OPEN) {
				try {
					sub.ws.send(payload);
				} catch {
					this._subscriptions.delete(key);
				}
			}
		}
	}

	clear(): void {
		this._subscriptions.clear();
	}

	entries(): IterableIterator<[string, WsSubscription]> {
		return this._subscriptions.entries();
	}
}
