import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { MessageManagerClient } from "./message-manager-client";

export class TopicSubscriber {
	/** Currently subscribed topics (empty when not subscribed). */
	topics: EventEnumMap[] = [];

	constructor(private readonly _client: MessageManagerClient) {}

	async subscribe(topics: EventEnumMap[]): Promise<void> {
		await this._client.subscribeToTopics(topics);
		this.topics = topics;
	}

	async unsubscribeAll(): Promise<void> {
		await this._client.unSubscribeToTopic(this.topics);
		this.topics = [];
	}
}
