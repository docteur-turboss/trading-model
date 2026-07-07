import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type WebSocket from "ws";
import type { IncomingWssMessage } from "./wss-message.types";

interface SubscriptionContext {
	ws: WebSocket;
	identity: ServiceIdentity;
	topics: Set<string>;
}

export class TopicSubscriptionHandler {
	handleSubscribe(
		msg: IncomingWssMessage,
		ctx: SubscriptionContext
	): void {
		if (!this._validateMessage(msg, ctx)) {
			return;
		}
		for (const topic of msg.topics as string[]) {
			ctx.topics.add(topic);
		}
		ctx.ws.send(JSON.stringify({ type: "subscribed", topics: [...ctx.topics] }));
	}

	handleUnsubscribe(
		msg: IncomingWssMessage,
		ctx: SubscriptionContext
	): void {
		if (!this._validateMessage(msg, ctx)) {
			return;
		}
		for (const topic of msg.topics as string[]) {
			ctx.topics.delete(topic);
		}
		ctx.ws.send(JSON.stringify({ type: "unsubscribed", topics: [...ctx.topics] }));
	}

	private _validateMessage(
		msg: IncomingWssMessage,
		{ ws, identity }: SubscriptionContext
	): boolean {
		if (!this._checkInstanceId(msg, identity, ws)) {
			return false;
		}
		return this._checkTopicsArray(msg, ws);
	}

	private _checkInstanceId(
		msg: IncomingWssMessage,
		identity: ServiceIdentity,
		ws: WebSocket
	): boolean {
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== identity.instanceId) {
			ws.send(
				JSON.stringify({ type: "error", message: "instanceId mismatch" })
			);
			return false;
		}
		return true;
	}

	private _checkTopicsArray(
		msg: IncomingWssMessage,
		ws: WebSocket
	): boolean {
		const rawTopics = msg.topics;
		if (
			Array.isArray(rawTopics) &&
			rawTopics.every((topic) => typeof topic === "string")
		) {
			return true;
		}
		ws.send(
			JSON.stringify({
				type: "error",
				message: "topics must be an array of strings",
			})
		);
		return false;
	}
}
