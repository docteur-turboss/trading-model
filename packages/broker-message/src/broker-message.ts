import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import {
	DlqEvent,
	type DlqEventMap,
	isDlqEventTopic,
} from "@trading-model/contracts/dlq-events";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import {
	type InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { BusConsumer } from "./bus/consumer";
import { DeadStreams } from "./bus/dead-streams";
import { publishToBus } from "./bus/publisher";
import type { RedisMessageJournal } from "./bus/redis-journal";
import { MessageMetadataBuilder } from "./messages/message-metadata-builder";
import { type DeliveredMessage, deliverToHandler } from "./messages.controller";
import { deadLetterError } from "./shared/errors";

/** Publishes and subscribes to messages through the bus in Redis (ADR-0073). */
export default class BrokerMessage {
	private _topics: EventEnumMap[] = [];
	private readonly _journal: RedisMessageJournal;
	private _consumer?: BusConsumer;
	private readonly _serviceName: ServiceInstanceName;
	private readonly _instanceId: InstanceId;

	constructor({
		journal,
		instanceId,
		serviceName,
	}: {
		journal: RedisMessageJournal;
		instanceId: InstanceId;
		serviceName: ServiceInstanceName;
	}) {
		this._journal = journal;
		this._serviceName = serviceName;
		this._instanceId = instanceId;
	}

	/** Consumes the specified event topics in this process, each message through `handle`. */
	async intents(
		topics: readonly EventEnumMap[],
		handle: (message: DeliveredMessage, signal?: AbortSignal) => Promise<void>
	): Promise<void> {
		this._topics = [...topics];
		await this._consume(handle);
	}

	private async _consume(
		handle: (message: DeliveredMessage, signal?: AbortSignal) => Promise<void>
	): Promise<void> {
		const journal = this._journal;
		await this._consumer?.stop();
		this._consumer = new BusConsumer({
			journal,
			deadStreams: new DeadStreams(journal),
			service: this._serviceName,
			handle: async ({ metadata, payload }, signal) => {
				if (!(await deliverToHandler({ metadata, payload }, handle, signal))) {
					throw deadLetterError("Invalid payload format", {
						reason: "REJECTED_BY_SUBSCRIBER",
					});
				}
			},
			onDeadLetter: (group, _message, reason, deadId) =>
				this._publishDeadLetterEvent(group.topic, reason, deadId),
		});
		void this._startConsumer(this._consumer, this._topics);
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

	/** Stops the consumer. */
	async stopMessageManager(): Promise<void> {
		await this._consumer?.stop();
		this._consumer = undefined;
		this._topics = [];
	}

	/** Publishes messages to the bus. */
	get post() {
		const journal = this._journal;
		return {
			indirect: (payload: unknown, metadata: MessageMetadata) =>
				publishToBus(journal, payload, metadata),
		};
	}
}

/** Metadata builder utility. */
export const HELPER = {
	metadataBuilder: MessageMetadataBuilder,
};
