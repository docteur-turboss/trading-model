import type addressManagerClient from "@trading-model/address-manager";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import {
	DlqEvent,
	type DlqEventMap,
	isDlqEventTopic,
} from "@trading-model/contracts/dlq-events";
import type {
	EventEnumMap,
	EventMap,
	EventMessagesArgs,
} from "@trading-model/contracts/event-map";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import { HttpClient } from "@trading-model/http/http-client";
import {
	type InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { BusConsumer } from "./bus/consumer";
import { DeadStreams } from "./bus/dead-streams";
import { publishToBus } from "./bus/publisher";
import type { RedisMessageJournal } from "./bus/redis-journal";
import type { Listener } from "./event-manager-client";
import { EVENT_MANAGER } from "./event-manager-client";
import { MessageManagerClient } from "./message-manager-client";
import { MessageMetadataBuilder } from "./messages/message-metadata-builder";
import { deliverToListeners } from "./messages.controller";
import { deadLetterError } from "./shared/errors";

/** Renewal period of topic subscriptions (also the retry delay after a failure). */
export const SUBSCRIPTION_REFRESH_MS = 15_000;

/** Callback path a subscriber mounts when it names none (audit-logger). */
export const DEFAULT_CALLBACK_PATH = "message";

/** Publishes and subscribes to messages through the message manager. */
export default class BrokerMessage {
	private _messageManagerClient: MessageManagerClient;

	private _callbackPath = DEFAULT_CALLBACK_PATH;
	private _httpClient: HttpClient;

	private _topics: EventEnumMap[] = [];
	private _refreshTimer?: ReturnType<typeof setInterval>;
	private _eventCleanups: (() => void)[] = [];
	private readonly _journal?: RedisMessageJournal;
	private _consumer?: BusConsumer;
	private readonly _serviceName: ServiceInstanceName;
	private readonly _instanceId: InstanceId;

	constructor({
		journal,
		addressManagerClient,
		tlsPaths,
		callbackPath: userCallbackPath,
		instanceId,
		serviceName,
	}: {
		/**
		 * The bus in Redis (ADR-0073): when set, publishing is an `XADD` and the
		 * subscribed topics are consumed in this process. Absent: HTTP through
		 * message-manager.
		 */
		journal?: RedisMessageJournal;
		instanceId: InstanceId;
		callbackPath?: string;
		tlsPaths: TlsPaths;
		addressManagerClient: addressManagerClient;
		serviceName: ServiceInstanceName;
	}) {
		this._journal = journal;
		this._serviceName = serviceName;
		this._instanceId = instanceId;
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
		await this._consume();
		await this._subscribeOnce();
		this._refreshTimer = setInterval(
			() => void this._subscribeOnce(),
			SUBSCRIPTION_REFRESH_MS
		);
		this._refreshTimer.unref();
	}

	private async _consume(): Promise<void> {
		await this._consumer?.stop();
		this._consumer = undefined;
		const journal = this._journal;
		// No listener = the service reads only the callback route: consuming here would ack and drop entries owed to message-manager's workers.
		const topics = this._topics.filter(
			(topic) => EVENT_MANAGER.listenerCount(topic as keyof EventMap) > 0
		);
		if (!journal || topics.length === 0) {
			return;
		}
		this._consumer = new BusConsumer({
			journal,
			deadStreams: new DeadStreams(journal),
			service: this._serviceName,
			handle: async ({ metadata, payload }, signal) => {
				if (!(await deliverToListeners(metadata, payload, signal))) {
					throw deadLetterError("Invalid payload format", {
						reason: "REJECTED_BY_SUBSCRIBER",
					});
				}
			},
			onDeadLetter: (group, _message, reason, deadId) =>
				this._publishDeadLetterEvent(group.topic, reason, deadId),
		});
		void this._startConsumer(this._consumer, topics);
	}

	/**
	 * Not awaited: until Redis knows this service's ACL user (a rollout applies Redis after the services),
	 * the groups cannot be created, and the service must still start and serve its HTTP routes.
	 */
	private async _startConsumer(
		consumer: BusConsumer,
		topics: readonly string[]
	): Promise<void> {
		while (this._consumer === consumer) {
			try {
				await consumer.start(topics);
				return;
			} catch (err) {
				getLogger().error("Bus consumer not started, retrying", {
					context: { error: normalizeError(err).message },
				});
				await new Promise((resolve) => setTimeout(resolve, 5000).unref());
			}
		}
	}

	/** The audit trail records each dead letter (a dead DLQ event does not publish another: it would loop). */
	private _publishDeadLetterEvent(
		topic: string,
		reason: string,
		entryId: string
	): void {
		if (isDlqEventTopic(topic)) {
			return;
		}
		void this._postBus(DlqEvent.EntryAdded, {
			entryId,
			topic,
			reason,
			actor: null,
		}).catch((err: unknown) =>
			getLogger().error("Dead-letter event not published", {
				context: { topic, entryId, error: normalizeError(err).message },
			})
		);
	}

	private _postBus<TEvent extends DlqEvent>(
		event: TEvent,
		payload: DlqEventMap[TEvent]
	): Promise<void> {
		return this.post.indirect(
			payload,
			new MessageMetadataBuilder(Topic.of(event), event, {
				instanceId: this._instanceId,
				serviceName: ServiceId.of(this._serviceName),
			})
				.setDelivery({ mode: DeliveryMode.AtLeastOnce })
				.toJSON()
		);
	}

	private async _subscribeOnce(): Promise<void> {
		try {
			await this._messageManagerClient.subscribe(this._topics);
		} catch (error) {
			getLogger().warn("Topic subscription failed, retrying", {
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
		await this._consumer?.stop();
		this._consumer = undefined;
		await this._messageManagerClient.unsubscribe(this._topics);
		this._topics = [];
		for (const fn of this._eventCleanups) {
			fn();
		}
		this._eventCleanups = [];
	}

	/** Registers a listener for a broker message event; call it before `intents`, which consumes on the bus only the topics with a listener. */
	on<TEvent extends keyof EventMap>(
		eventName: TEvent,
		listener: Listener<EventMessagesArgs<TEvent>>
	) {
		this._eventCleanups.push(EVENT_MANAGER.on(eventName, listener));
	}

	/** Publishes messages through the Message Manager. */
	get post() {
		const client = this._messageManagerClient;
		const journal = this._journal;
		return {
			indirect: journal
				? (payload: unknown, metadata: MessageMetadata) =>
						publishToBus(journal, payload, metadata)
				: client.publish.bind(client),
		};
	}
}

/** Metadata builder utility. */
export const HELPER = {
	metadataBuilder: MessageMetadataBuilder,
};
