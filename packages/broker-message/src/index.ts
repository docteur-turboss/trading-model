import type addressManagerClient from "@trading-model/address-manager";
import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";
import { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { Application } from "express";

import type { Listener } from "./client/event-manager-client";
import { EventSubscriber } from "./client/event-subscriber";
import { MessageManagerClient } from "./client/message-manager-client";
import { TopicSubscriber } from "./client/topic-subscriber";
import { CREATE_CALLBACK_ROUTE } from "./http/messages.routes";
import { MessageMetadata } from "./shared/helper/messages/message";

/**
 * Central orchestrator for broker message operations.
 *
 * Delegates topic subscription lifecycle to TopicSubscriber and
 * event listener management to EventSubscriber, keeping the
 * publishing and Express route mounting concerns directly.
 */
export default class BrokerMessage {
	private _messageManagerClient: MessageManagerClient;

	private _callbackPath = "message";
	private _httpClient: HttpClient;

	readonly topics: TopicSubscriber;
	readonly events: EventSubscriber;

	constructor({
		addressManagerClient,
		tlsPaths,
		callbackPath: userCallbackPath,
		instanceId,
		serviceName,
	}: {
		instanceId: InstanceId;
		callbackPath?: string;
		tlsPaths: TlsPaths;
		addressManagerClient: addressManagerClient;
		serviceName: ServiceInstanceName;
	}) {
		if (userCallbackPath) {
			this._callbackPath = userCallbackPath;
		}
		this._httpClient = HttpClient.createWithTls(tlsPaths);
		this._messageManagerClient = new MessageManagerClient(
			this._httpClient,
			{ callbackPath: this._callbackPath, instanceId, serviceName },
			addressManagerClient
		);
		this.topics = new TopicSubscriber(this._messageManagerClient);
		this.events = new EventSubscriber();
	}

	/** Subscribes to the specified event topics. */
	intents(
		topics: Parameters<MessageManagerClient["subscribeToTopics"]>[0]
	): Promise<void> {
		return this.topics.subscribe(topics);
	}

	/** Unsubscribes from all topics and cleans up event listeners. */
	async stopMessageManager(): Promise<void> {
		await this.topics.unsubscribeAll();
		this.events.removeAllListeners();
	}

	/** Registers a listener for a broker message event. */
	on<TEvent extends keyof EventMap>(
		eventName: TEvent,
		listener: Listener<EventMessagesArgs<TEvent>>
	) {
		this.events.on(eventName, listener);
	}

	/** Mounts the callback route on the Express application. */
	listenExpress(app: Application) {
		app.use(CREATE_CALLBACK_ROUTE(this._callbackPath));
	}

	/** Publishes messages directly or indirectly to services. */
	get post() {
		return {
			direct: this._publishDirect.bind(this),
			indirect: this._publishToTopic.bind(this),
		};
	}

	private _publishDirect<
		TPayload = Parameters<MessageManagerClient["publishDirectMessage"]>[1],
	>(
		service: Parameters<MessageManagerClient["publishDirectMessage"]>[0],
		payload: TPayload,
		metadata: Parameters<MessageManagerClient["publishDirectMessage"]>[2]
	) {
		return this._messageManagerClient.publishDirectMessage(
			service,
			payload,
			metadata
		);
	}

	private _publishToTopic<
		TPayload = Parameters<MessageManagerClient["publishAsyncMessage"]>[0],
	>(
		payload: TPayload,
		metadata: Parameters<MessageManagerClient["publishAsyncMessage"]>[1]
	) {
		return this._messageManagerClient.publishAsyncMessage(payload, metadata);
	}
}

/** Metadata builder utility. */
export const HELPER = {
	metadataBuilder: MessageMetadata,
};

export { EVENT_MANAGER } from "./client/event-manager-client";
export type { SubscribesTopicsPayload } from "./shared/types/payloads";
