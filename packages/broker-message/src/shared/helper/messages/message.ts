import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";

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
	public topic!: string;
	public routing?: RoutingType;
	public delivery?: DeliveryType;
	public security?: SecurityType;
	public eventType!: string;
	public publisher!: ServiceIdentity;
	public schemaVersion = "1.0.0";
	private _causationId?: string;
	private _correlationId?: string;

	public constructor(data: Partial<MetadataType> = {}) {
		MESSAGE_METADATA_SCHEMA.partial().parse(data);

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
		this.topic = topic!;
		this.eventType = eventType!;
		this.publisher = publisher!;

		void this._causationId;
		void this._correlationId;
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

		this.topic = topic;
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
			this._causationId = context.causationId;
		}

		if (context.correlationId) {
			IDS_METADATA_PREDICATE.parse(context?.correlationId);
			this._correlationId = context.correlationId;
		}

		return this;
	}

	/**
	 * Transforms the embed to a plain object
	 */
	public toJSON(): MetadataType {
		const {
			eventType,
			publisher,
			schemaVersion,
			topic,
			_causationId: causationId,
			_correlationId: correlationId,
			delivery,
			routing,
			security,
		} = this;

		if (!topic) {
			throw new AppError(
				"You haven't defined a topic",
				ErrorCodes.METADATA_BUILDER_ERROR
			);
		}
		if (!eventType) {
			throw new AppError(
				"You haven't defined a eventType",
				ErrorCodes.METADATA_BUILDER_ERROR
			);
		}
		if (!publisher) {
			throw new AppError(
				"You haven't defined a publisher",
				ErrorCodes.METADATA_BUILDER_ERROR
			);
		}

		return {
			eventType,
			publisher,
			schemaVersion,
			topic,
			causationId,
			correlationId,
			delivery,
			routing,
			security,
		};
	}
}
