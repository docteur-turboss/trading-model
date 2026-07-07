import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type {
	MessageMetadata as MetadataType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import {
	type CorrelationId,
	type Topic,
	toTopic,
} from "@trading-model/common/domain/primitives";
import {
	EVENT_TYPE_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import {
	type ChainingMetadata,
	MessageChainingMetadata,
	NullMessageChainingMetadata,
} from "./message-chaining-metadata";
import { MessageContext } from "./message-context";

export class MessageMetadata {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0" as const;
	private readonly _context = new MessageContext();
	private _chaining: ChainingMetadata;

	public constructor(
		topic: string,
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
		if (data.routing) this._context.routing = data.routing;
		if (data.delivery) this._context.delivery = data.delivery;
		if (data.security) this._context.security = data.security;
		this._chaining =
			data.causationId || data.correlationId
				? new MessageChainingMetadata({
						causationId: data.causationId,
						correlationId: data.correlationId,
					})
				: new NullMessageChainingMetadata();
	}

	public get causationId(): CorrelationId | undefined {
		return this._chaining.causationId;
	}
	public get correlationId(): CorrelationId | undefined {
		return this._chaining.correlationId;
	}

	public setSecurity(
		context:
			| import("@trading-model/common/contracts/message.types").SecurityType
			| null
	): this {
		this._context.setSecurity(context);
		return this;
	}
	public setDelivery(
		context:
			| import("@trading-model/common/contracts/message.types").DeliveryType
			| null
	): this {
		this._context.setDelivery(context);
		return this;
	}
	public setRouting(
		context:
			| import("@trading-model/common/contracts/message.types").RoutingType
			| null
	): this {
		this._context.setRouting(context);
		return this;
	}
	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);
		this.publisher = context;
		return this;
	}
	public setSchemaVersion(version: string | null): this {
		if (version === null) {
			this.schemaVersion = "1.0.0";
			return this;
		}
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
	public setIds(
		context: { causationId?: string; correlationId?: string } | null
	): this {
		if (context === null) {
			this._chaining = new NullMessageChainingMetadata();
			return this;
		}
		if (!(context.causationId || context.correlationId)) return this;
		this._chaining = new MessageChainingMetadata(context);
		return this;
	}

	public toJSON(): MetadataType {
		return {
			eventType: this.eventType,
			publisher: this.publisher,
			schemaVersion: this.schemaVersion,
			topic: this.topic,
			...this._chaining.toJSON(),
			...this._context.toJSON(),
		};
	}
}
