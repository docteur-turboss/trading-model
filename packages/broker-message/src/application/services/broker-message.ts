import type addressManagerClient from "@trading-model/address-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import type {
	EventEnumMap,
	EventMap,
	EventMessagesArgs,
} from "@trading-model/contracts/event-map";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { InstanceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { CREATE_CALLBACK_ROUTE } from "../../adapters/inbound/messages.routes";
import { MessageManagerClient } from "../../adapters/outbound/message-manager-client";
import { MessageMetadataBuilder } from "../../domain/messages/message-metadata-builder";
import type { Listener } from "./event-manager-client";
import { EVENT_MANAGER } from "./event-manager-client";

/** Renewal period of topic subscriptions (also the retry delay after a failure). */
export const SUBSCRIPTION_REFRESH_MS = 15_000;

/** Callback path a subscriber mounts when it names none (audit-logger). */
export const DEFAULT_CALLBACK_PATH = "message";

export default class BrokerMessage {
	private _messageManagerClient: MessageManagerClient;

	private _callbackPath = DEFAULT_CALLBACK_PATH;
	private _httpClient: HttpClient;

	private _topics: EventEnumMap[] = [];
	private _refreshTimer?: ReturnType<typeof setInterval>;
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

	/**
	 * Subscribes to the specified event topics and keeps the subscriptions alive.
	 *
	 * Never rejects: a failed attempt is logged and retried. Subscriptions are
	 * then renewed every `SUBSCRIPTION_REFRESH_MS` (idempotent on the
	 * message-manager side): message-manager expires a subscription not renewed
	 * for 60s, and the renewal restores the ones its store lost.
	 */
	async intents(
		topics: Parameters<MessageManagerClient["subscribe"]>[0]
	): Promise<void> {
		this._topics = topics as EventEnumMap[];
		this._stopRefresh();
		await this._subscribeOnce();
		this._refreshTimer = setInterval(
			() => void this._subscribeOnce(),
			SUBSCRIPTION_REFRESH_MS
		);
		this._refreshTimer.unref();
	}

	private async _subscribeOnce(): Promise<void> {
		try {
			await this._messageManagerClient.subscribe(this._topics);
		} catch (error) {
			logger.warn("Topic subscription failed, retrying", {
				context: {
					topics: this._topics,
					retryInMs: SUBSCRIPTION_REFRESH_MS,
					error: normalizeError(error).message,
				},
			});
		}
	}

	private _stopRefresh(): void {
		if (this._refreshTimer) {
			clearInterval(this._refreshTimer);
			this._refreshTimer = undefined;
		}
	}

	/** Unsubscribes from all topics and cleans up event listeners. */
	async stopMessageManager(): Promise<void> {
		this._stopRefresh();
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
