import type { EventEnumMap } from "@trading-model/contracts/event-map";
import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/contracts/message-types";
import {
	type CorrelationId,
	type Topic,
	toCorrelationId,
	toTopic,
} from "@trading-model/primitives/primitives";
import {
	DELIVERY_METADATA_MODE_PREDICATE,
	EVENT_TYPE_METADATA_PREDICATE,
	IDS_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "../../shared/barrel/message.schema";

export interface ChainingIds {
	causationId?: CorrelationId;
	correlationId?: CorrelationId;
}

const toId = (id: CorrelationId | undefined) =>
	id ? toCorrelationId(IDS_METADATA_PREDICATE.parse(id) as string) : undefined;

export class MessageMetadataBuilder {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0" as const;
	private _delivery?: DeliveryType;
	private _routing?: RoutingType;
	private _security?: SecurityType;
	/** `undefined` until an id is set: toJSON then carries no id key at all. */
	private _ids?: ChainingIds;

	public constructor(
		topic: Topic,
		eventType: EventEnumMap,
		publisher: ServiceIdentity,
		data: Partial<Omit<MetadataType, "topic" | "eventType" | "publisher">> = {}
	) {
		TOPIC_METADATA_PREDICATE.parse(topic);
		EVENT_TYPE_METADATA_PREDICATE.parse(eventType);
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(publisher);
		this.topic = toTopic(topic);
		this.eventType = eventType;
		this.publisher = publisher;
		this._delivery = data.delivery;
		this._routing = data.routing;
		this._security = data.security;
		this.setIds(data);
	}

	public get causationId(): CorrelationId | undefined {
		return this._ids?.causationId;
	}
	public get correlationId(): CorrelationId | undefined {
		return this._ids?.correlationId;
	}

	public setSecurity(context: SecurityType | null): this {
		if (context !== null) {
			SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);
		}
		this._security = context ?? undefined;
		return this;
	}
	public setDelivery(context: DeliveryType | null): this {
		if (context !== null) {
			DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		}
		this._delivery = context ?? undefined;
		return this;
	}
	public setRouting(context: RoutingType | null): this {
		if (context !== null) {
			ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);
		}
		this._routing = context ?? undefined;
		return this;
	}
	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);
		this.publisher = context;
		return this;
	}
	public setSchemaVersion(version: string | null): this {
		if (version !== null) {
			SCHEMA_METADATA_VERSION_PREDICATE.parse(version);
		}
		this.schemaVersion = (version ?? "1.0.0") as "1.0.0";
		return this;
	}
	public setEventType(event: EventEnumMap): this {
		EVENT_TYPE_METADATA_PREDICATE.parse(event);
		this.eventType = event;
		return this;
	}
	public setTopic(topic: Topic): this {
		TOPIC_METADATA_PREDICATE.parse(topic);
		this.topic = toTopic(topic);
		return this;
	}
	/** Replaces both ids; `null` clears them, an object with neither id keeps them. */
	public setIds(context: ChainingIds | null): this {
		if (context === null) {
			this._ids = undefined;
		} else if (context.causationId || context.correlationId) {
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
			routing: this._routing,
			security: this._security,
		};
	}
}
