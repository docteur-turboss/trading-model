import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import {
	type Topic,
	toTopic,
} from "@trading-model/common/domain/primitives";

import {
	EVENT_TYPE_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import { MessageContextMetadata } from "./message-context-metadata";
import { MessageIdsMetadata } from "./message-ids-metadata";

export class MessageMetadata {
	public topic: Topic;
	public eventType: string;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0";
	private readonly _context = new MessageContextMetadata();
	private readonly _ids = new MessageIdsMetadata();

	public constructor(
		topic: string,
		eventType: string,
		publisher: ServiceIdentity,
		data: Partial<Omit<MetadataType, "topic" | "eventType" | "publisher">> = {},
	) {
		TOPIC_METADATA_PREDICATE.parse(topic);
		EVENT_TYPE_METADATA_PREDICATE.parse(eventType);
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(publisher);

		this.topic = toTopic(topic);
		this.eventType = eventType;
		this.publisher = publisher;
		this._context.assignFromData(data);
		this._ids.assignFromData(data);
	}

	public setSecurity(context: SecurityType | null): this {
		this._context.setSecurity(context);
		return this;
	}

	public setDelivery(context: DeliveryType | null): this {
		this._context.setDelivery(context);
		return this;
	}

	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);

		this.publisher = context;
		return this;
	}

	public setRouting(context: RoutingType | null): this {
		this._context.setRouting(context);
		return this;
	}

	public setSchemaVersion(version: string | null): this {
		if (version === null) {
			this.schemaVersion = "1.0.0";
			return this;
		}

		SCHEMA_METADATA_VERSION_PREDICATE.parse(version);

		this.schemaVersion = version;
		return this;
	}

	public setEventType(event: string): this {
		EVENT_TYPE_METADATA_PREDICATE.parse(event);

		this.eventType = event;
		return this;
	}

	public setTopic(topic: string): this {
		TOPIC_METADATA_PREDICATE.parse(topic);

		this.topic = toTopic(topic);
		return this;
	}

	public setIds(
		context: {
			causationId?: string;
			correlationId?: string;
		} | null
	): this {
		this._ids.setIds(context);
		return this;
	}

	public toJSON(): MetadataType {
		return {
			eventType: this.eventType,
			publisher: this.publisher,
			schemaVersion: this.schemaVersion,
			topic: this.topic,
			causationId: this._ids.causationId,
			correlationId: this._ids.correlationId,
			delivery: this._context.delivery,
			routing: this._context.routing,
			security: this._context.security,
		};
	}
}
