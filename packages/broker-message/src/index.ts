import type addressManagerClient from "@trading-model/address-manager";
import type {
	EventEnumMap,
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";
import { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { Application } from "express";

import { EVENT_MANAGER, type Listener } from "./client/event-manager-client";
import { MessageManagerClient } from "./client/message-manager-client";
import { CREATE_CALLBACK_ROUTE } from "./http/messages.routes";
import { MessageMetadata } from "./shared/helper/messages/message";

/**
 * Central orchestrator for broker message operations.
 *
 * Responsibilities:
 * - Manages an HTTP client for service communication
 * - Coordinates topic subscriptions and unsubscriptions
 * - Publishes messages directly or via the message broker
 * - Manages event listeners for incoming messages
 * - Mounts Express callback routes for message delivery
 */
export default class BrokerMessage {
	private _messageManagerClient: MessageManagerClient;

	/** Currently subscribed topics (empty when not subscribed). */
	topics: EventEnumMap[] = [];

	/** Cleanup functions to be called on stop. */
	cleanupFns: (() => void)[] = [];

	private _callbackPath = "message";
	private _httpClient: HttpClient;

	constructor({
		addressManagerClient,
		tlsPaths,
		callbackPath: userCallbackPath,
		instanceId,
		serviceName,
	}: {
		instanceId: string;
		callbackPath?: string;
		tlsPaths: TlsPaths;
		addressManagerClient: addressManagerClient;
		serviceName: ServiceInstanceName;
	}) {
		if (userCallbackPath) {
			this._callbackPath = userCallbackPath;
		}
		this._httpClient = this._createHttpClient(tlsPaths);
		this._messageManagerClient = this._createMessageManagerClient(
			addressManagerClient,
			instanceId,
			serviceName,
		);
	}

	private _createHttpClient(tls: TlsPaths): HttpClient {
		return HttpClient.createWithTls(tls);
	}

	private _createMessageManagerClient(
		addressManagerClient: addressManagerClient,
		instanceId: string,
		serviceName: ServiceInstanceName,
	): MessageManagerClient {
		return new MessageManagerClient(
			this._httpClient,
			{ callbackPath: this._callbackPath, instanceId, serviceName },
			addressManagerClient,
		);
	}

	/** Subscribes to the specified event topics. */
	async intents(
		topics: Parameters<MessageManagerClient["subscribeToTopics"]>[0]
	): Promise<void> {
		await this._messageManagerClient.subscribeToTopics(topics);
		this.topics = topics;
	}

	/** Unsubscribes from all topics and cleans up event listeners. */
	async stopMessageManager(): Promise<void> {
		await this._messageManagerClient.unSubscribeToTopic(this.topics);
		this.cleanupFns.forEach((fn) => {
			fn();
		});
		this.topics = [];
	}

	/** Registers a listener for a broker message event. */
	on<TEvent extends keyof EventMap>(
		eventName: TEvent,
		listener: Listener<EventMessagesArgs<TEvent>>
	) {
		this.cleanupFns.push(EVENT_MANAGER.on(eventName, listener));
	}

	/** Mounts the callback route on the Express application. */
	listenExpress(app: Application) {
		app.use(CREATE_CALLBACK_ROUTE(this._callbackPath));
	}

	/** Publishes messages directly or indirectly to services. */
	get post() {
		return {
			direct: <TPayload = Parameters<MessageManagerClient["publishDirectMessage"]>[1]>(
				service: Parameters<MessageManagerClient["publishDirectMessage"]>[0],
				payload: TPayload,
				metadata: Parameters<MessageManagerClient["publishDirectMessage"]>[2],
			) => this._messageManagerClient.publishDirectMessage(service, payload, metadata),
			indirect: <TPayload = Parameters<MessageManagerClient["publishAsyncMessage"]>[0]>(
				payload: TPayload,
				metadata: Parameters<MessageManagerClient["publishAsyncMessage"]>[1],
			) => this._messageManagerClient.publishAsyncMessage(payload, metadata),
		};
	}
}

/** Metadata builder utility. */
export const HELPER = {
	metadataBuilder: MessageMetadata,
};

export { EVENT_MANAGER } from "./client/event-manager-client";
