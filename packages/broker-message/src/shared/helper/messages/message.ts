import { toCorrelationId, toTopic, type CorrelationId, type Topic } from "@trading-model/common/domain/primitives";
import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { AppError, metadataBuilderError } from "@trading-model/common/utils/errors";

import {
	DELIVERY_METADATA_MODE_PREDICATE,
	EVENT_TYPE_METADATA_PREDICATE,
	IDS_METADATA_PREDICATE,
	MESSAGE_METADATA_SCHEMA,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";

/**
 * Represents an metadata in a message
 */
export class MessageMetadata {
	public topic?: Topic;
	public routing?: RoutingType;
	public delivery?: DeliveryType;
	public security?: SecurityType;
	public eventType?: string;
	public publisher?: ServiceIdentity;
	public schemaVersion = "1.0.0";
	private _causationId?: CorrelationId;
	private _correlationId?: CorrelationId;

	public constructor(data: Partial<MetadataType> = {}) {
		MESSAGE_METADATA_SCHEMA.partial().parse(data);
		this._assignFromData(data);
	}

	private _assignFromData(data: Partial<MetadataType>): void {
		const {
			topic,
			routing,
			delivery,
			security,
			eventType,
			publisher,
			causationId,
			correlationId,
		} = data;
		this.routing = routing;
		this.delivery = delivery;
		this.security = security;
		this._causationId = causationId;
		this._correlationId = correlationId;
		this.topic = topic;
		this.eventType = eventType;
		this.publisher = publisher;
	}

	/**
	 * @param context The context to set.
	 */
	public setSecurity(context: SecurityType | null): this {
		if (context === null) {
			this.security = undefined;
			return this;
		}

		SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);

		this.security = context;
		return this;
	}

	/**
	 * @param context The context for the delivery mode
	 */
	public setDelivery(context: DeliveryType | null): this {
		if (context === null) {
			this.delivery = undefined;
			return this;
		}

		DELIVERY_METADATA_MODE_PREDICATE.parse(context);

		this.delivery = context;
		return this;
	}

	/**
	 * @param context The context of the Author.
	 */
	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);

		this.publisher = context;
		return this;
	}

	/**
	 * @param context The routing context  of the message
	 */
	public setRouting(context: RoutingType | null): this {
		if (context === null) {
			this.routing = undefined;
			return this;
		}

		// Data assertions
		ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);

		this.routing = context;
		return this;
	}

	/**
	 * @param version The version
	 */
	public setSchemaVersion(version: string | null): this {
		if (version === null) {
			this.schemaVersion = "1.0.0";
			return this;
		}

		SCHEMA_METADATA_VERSION_PREDICATE.parse(version);

		this.schemaVersion = version;
		return this;
	}

	/**
	 * @param event The event of this message
	 */
	public setEventType(event: string): this {
		// Data assertions
		EVENT_TYPE_METADATA_PREDICATE.parse(event);

		this.eventType = event;
		return this;
	}

	/**
	 * @param topic The topic of the message
	 */
	public setTopic(topic: string): this {
		// Data assertions
		TOPIC_METADATA_PREDICATE.parse(topic);

		this.topic = toTopic(topic);
		return this;
	}

	/**
	 * @param context - Object with optional causationId and/or correlationId, or null to clear both
	 */
	public setIds(
		context: {
			causationId?: string;
			correlationId?: string;
		} | null
	): this {
		if (context === null) {
			this._causationId = undefined;
			this._correlationId = undefined;
			return this;
		}

		// Data assertions
		if (context.causationId) {
			IDS_METADATA_PREDICATE.parse(context?.causationId);
			this._causationId = toCorrelationId(context.causationId);
		}

		if (context.correlationId) {
			IDS_METADATA_PREDICATE.parse(context?.correlationId);
			this._correlationId = toCorrelationId(context.correlationId);
		}

		return this;
	}

	/**
	 * Transforms the embed to a plain object
	 */
	public toJSON(): MetadataType {
		this._assertRequiredFields();
		return this._buildMetadata();
	}

	private _buildMetadata(): MetadataType {
		return {
			eventType: this.eventType!,
			publisher: this.publisher!,
			schemaVersion: this.schemaVersion,
			topic: this.topic!,
			causationId: this._causationId,
			correlationId: this._correlationId,
			delivery: this.delivery,
			routing: this.routing,
			security: this.security,
		};
	}

	private _assertRequiredFields(): void {
		if (!this.topic) {
			throw metadataBuilderError("You haven't defined a topic");
		}
		if (!this.eventType) {
			throw metadataBuilderError("You haven't defined a eventType");
		}
		if (!this.publisher) {
			throw metadataBuilderError("You haven't defined a publisher");
		}
	}
}
