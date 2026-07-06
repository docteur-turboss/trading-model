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
		{ ws, topics, identity }: SubscriptionContext
	): void {
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== identity.instanceId) {
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
		{ ws, topics, identity }: SubscriptionContext
	): void {
		const msgInstanceId = msg.instanceId;
		if (msgInstanceId && msgInstanceId !== identity.instanceId) {
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
}
