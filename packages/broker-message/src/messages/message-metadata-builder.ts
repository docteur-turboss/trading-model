import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	ServiceIdentity,
} from "@trading-model/contracts/message-types";
import { CorrelationId, Topic } from "@trading-model/primitives/primitives";
import {
	DELIVERY_METADATA_MODE_PREDICATE,
	EVENT_TYPE_METADATA_PREDICATE,
	IDS_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "../shared/barrel/message.schema";

/** Identifiers linking a message to the message it follows. */
export interface ChainingIds {
	causationId?: CorrelationId;
	correlationId?: CorrelationId;
}

const toId = (id: CorrelationId | undefined) =>
	id ? CorrelationId.of(IDS_METADATA_PREDICATE.parse(id) as string) : undefined;

/** Builds the metadata of an outgoing message. */
export class MessageMetadataBuilder {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0" as const;
	private _delivery?: DeliveryType;
	/** `undefined` until an id is set: toJSON then carries no id key at all. */
	private _ids?: ChainingIds;

	public constructor(
		topic: Topic,
		eventType: EventEnumMap,
		publisher: ServiceIdentity
	) {
		TOPIC_METADATA_PREDICATE.parse(topic);
		EVENT_TYPE_METADATA_PREDICATE.parse(eventType);
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(publisher);
		this.topic = Topic.of(topic);
		this.eventType = eventType;
		this.publisher = publisher;
	}

	public setDelivery(context: DeliveryType): this {
		DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		this._delivery = context;
		return this;
	}
	/** Replaces both ids; an object with neither id keeps them. */
	public setIds(context: ChainingIds): this {
		if (context.causationId || context.correlationId) {
			this._ids = {
				causationId: toId(context.causationId),
				correlationId: toId(context.correlationId),
			};
		}
		return this;
	}

	public toJSON(): MetadataType {
		return {
			eventType: this.eventType,
			publisher: this.publisher,
			schemaVersion: this.schemaVersion,
			topic: this.topic,
			...this._ids,
			delivery: this._delivery,
		};
	}
}
