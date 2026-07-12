import type { EventEnumMap } from "@trading-model/common/config/event.types";
import {
	type CorrelationId,
	type Topic,
	toTopic,
} from "@trading-model/common/domain/primitives";
import type {
	MessageMetadata as MetadataType,
	ServiceIdentity,
} from "@trading-model/validation/contracts/message.types";
import {
	EVENT_TYPE_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import {
	type ChainingMetadata,
	MessageChainingMetadata,
	NULL_MESSAGE_CHAINING_METADATA,
} from "./message-chaining-metadata";
import { MessageContext } from "./message-context";

export class MessageMetadata {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0" as const;
	private _context: MessageContext;
	private _chaining: ChainingMetadata;

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
		this._context = new MessageContext({
			routing: data.routing,
			delivery: data.delivery,
			security: data.security,
		});
		this._chaining =
			data.causationId || data.correlationId
				? new MessageChainingMetadata({
						causationId: data.causationId,
						correlationId: data.correlationId,
					})
				: NULL_MESSAGE_CHAINING_METADATA;
	}

	public get causationId(): CorrelationId | undefined {
		return this._chaining.causationId;
	}
	public get correlationId(): CorrelationId | undefined {
		return this._chaining.correlationId;
	}

	public setSecurity(
		context:
			| import("@trading-model/validation/contracts/message.types").SecurityType
			| null
	): this {
		this._context = this._context.withSecurity(context);
		return this;
	}
	public setDelivery(
		context:
			| import("@trading-model/validation/contracts/message.types").DeliveryType
			| null
	): this {
		this._context = this._context.withDelivery(context);
		return this;
	}
	public setRouting(
		context:
			| import("@trading-model/validation/contracts/message.types").RoutingType
			| null
	): this {
		this._context = this._context.withRouting(context);
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
	public setIds(
		context: {
			causationId?: CorrelationId;
			correlationId?: CorrelationId;
		} | null
	): this {
		if (context === null) {
			this._chaining = NULL_MESSAGE_CHAINING_METADATA;
			return this;
		}
		if (!(context.causationId || context.correlationId)) {
			return this;
		}
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
