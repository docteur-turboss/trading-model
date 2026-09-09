import type addressManagerClient from "@trading-model/address-manager";
import type {
	EventEnumMap,
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";
import { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { Application } from "express";
import { CREATE_CALLBACK_ROUTE } from "../../adapters/inbound/messages.routes";
import { MessageManagerClient } from "../../adapters/outbound/message-manager-client";
import { MessageMetadataBuilder } from "../../domain/messages/message-metadata-builder";
import type { Listener } from "./event-manager-client";
import { EVENT_MANAGER } from "./event-manager-client";

export default class BrokerMessage {
	private _messageManagerClient: MessageManagerClient;

	private _callbackPath = "message";
	private _httpClient: HttpClient;

	private _topics: EventEnumMap[] = [];
	private _eventCleanups: (() => void)[] = [];

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
	}

	/** Subscribes to the specified event topics. */
	intents(
		topics: Parameters<MessageManagerClient["subscribe"]>[0]
	): Promise<void> {
		this._topics = topics as EventEnumMap[];
		return this._messageManagerClient.subscribe(topics);
	}

	/** Unsubscribes from all topics and cleans up event listeners. */
	async stopMessageManager(): Promise<void> {
		await this._messageManagerClient.unsubscribe(this._topics);
		this._topics = [];
		for (const fn of this._eventCleanups) {
			fn();
		}
		this._eventCleanups = [];
	}

	/** Registers a listener for a broker message event. */
	on<TEvent extends keyof EventMap>(
		eventName: TEvent,
		listener: Listener<EventMessagesArgs<TEvent>>
	) {
		this._eventCleanups.push(EVENT_MANAGER.on(eventName, listener));
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
		TPayload = Parameters<MessageManagerClient["publish"]>[0],
	>(
		payload: TPayload,
		metadata: Parameters<MessageManagerClient["publish"]>[1]
	) {
		return this._messageManagerClient.publish(payload, metadata);
	}
}

/** Metadata builder utility. */
export const HELPER = {
	metadataBuilder: MessageMetadataBuilder,
};
