import type { DeliveryType, MessageMetadata as MetadataType, RoutingType, SecurityType, ServiceIdentity } from "@trading-model/common/contracts/message.types";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { type CorrelationId, type Topic, toTopic } from "@trading-model/common/domain/primitives";
import {
	DELIVERY_METADATA_MODE_PREDICATE, EVENT_TYPE_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE, ROUTING_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE, SECURITY_METADATA_CONTEXT_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import { type ChainingMetadata, MessageChainingMetadata, NullMessageChainingMetadata } from "./message-chaining-metadata";

export class MessageMetadata {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion: "1.0.0" = "1.0.0";
	public security?: SecurityType;
	public delivery?: DeliveryType;
	public routing?: RoutingType;
	private _chaining: ChainingMetadata;

	public constructor(topic: string, eventType: EventEnumMap, publisher: ServiceIdentity, data: Partial<Omit<MetadataType, "topic" | "eventType" | "publisher">> = {}) {
		TOPIC_METADATA_PREDICATE.parse(topic);
		EVENT_TYPE_METADATA_PREDICATE.parse(eventType);
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(publisher);
		this.topic = toTopic(topic);
		this.eventType = eventType;
		this.publisher = publisher;
		if (data.routing) this.routing = data.routing;
		if (data.delivery) this.delivery = data.delivery;
		if (data.security) this.security = data.security;
		this._chaining = (data.causationId || data.correlationId)
			? new MessageChainingMetadata({ causationId: data.causationId, correlationId: data.correlationId })
			: new NullMessageChainingMetadata();
	}

	public get causationId(): CorrelationId | undefined { return this._chaining.causationId; }
	public get correlationId(): CorrelationId | undefined { return this._chaining.correlationId; }

	public setSecurity(context: SecurityType | null): this {
		if (context === null) { this.security = undefined; return this; }
		SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);
		this.security = context;
		return this;
	}
	public setDelivery(context: DeliveryType | null): this {
		if (context === null) { this.delivery = undefined; return this; }
		DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		this.delivery = context;
		return this;
	}
	public setRouting(context: RoutingType | null): this {
		if (context === null) { this.routing = undefined; return this; }
		ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);
		this.routing = context;
		return this;
	}
	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);
		this.publisher = context;
		return this;
	}
	public setSchemaVersion(version: string | null): this {
		if (version === null) { this.schemaVersion = "1.0.0"; return this; }
		SCHEMA_METADATA_VERSION_PREDICATE.parse(version);
		this.schemaVersion = version as "1.0.0";
		return this;
	}
	public setEventType(event: string): this {
		EVENT_TYPE_METADATA_PREDICATE.parse(event);
		this.eventType = event as EventEnumMap;
		return this;
	}
	public setTopic(topic: string): this {
		TOPIC_METADATA_PREDICATE.parse(topic);
		this.topic = toTopic(topic);
		return this;
	}
	public setIds(context: { causationId?: string; correlationId?: string } | null): this {
		if (context === null) {
			this._chaining = new NullMessageChainingMetadata();
			return this;
		}
		if (!(context.causationId || context.correlationId)) return this;
		this._chaining = new MessageChainingMetadata(context);
		return this;
	}

	public toJSON(): MetadataType {
		return { eventType: this.eventType, publisher: this.publisher, schemaVersion: this.schemaVersion, topic: this.topic, ...this._chaining.toJSON(), delivery: this.delivery, routing: this.routing, security: this.security };
	}
}
