import type {
	DeliveryType,
	MessageMetadata as MetadataType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";

import { MESSAGE_METADATA_SCHEMA } from "./message.schema";
import { MetadataValidator } from "./metadata-validator";
import { MetadataSerializer, type MetadataState } from "./metadata-serializer";

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
	private _validator = new MetadataValidator();
	private _serializer = new MetadataSerializer();

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
		this.topic = topic!;
		this.eventType = eventType!;
		this.publisher = publisher!;
	}

	/**
	 * @param context The context to set.
	 */
	public setSecurity(context: SecurityType | null): this {
		if (context === null) {
			this.security = undefined;
			return this;
		}

		this._validator.validateSecurity(context);

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

		this._validator.validateDelivery(context);

		this.delivery = context;
		return this;
	}

	/**
	 * @param context The context of the Author.
	 */
	public setPublisher(context: ServiceIdentity): this {
		this._validator.validatePublisher(context);

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

		this._validator.validateRouting(context);

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

		this._validator.validateSchemaVersion(version);

		this.schemaVersion = version;
		return this;
	}

	/**
	 * @param event The event of this message
	 */
	public setEventType(event: string): this {
		this._validator.validateEventType(event);

		this.eventType = event;
		return this;
	}

	/**
	 * @param topic The topic of the message
	 */
	public setTopic(topic: string): this {
		this._validator.validateTopic(topic);

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

		this._validator.validateIds(context);

		if (context.causationId) {
			this._causationId = context.causationId;
		}

		if (context.correlationId) {
			this._correlationId = context.correlationId;
		}

		return this;
	}

	/**
	 * Transforms the embed to a plain object
	 */
	public toJSON(): MetadataType {
		this._validator.assertRequiredFields(this.topic, this.eventType, this.publisher);
		return this._serializer.toJSON(this._getState());
	}

	private _getState(): MetadataState {
		return {
			topic: this.topic,
			routing: this.routing,
			delivery: this.delivery,
			security: this.security,
			eventType: this.eventType,
			publisher: this.publisher,
			schemaVersion: this.schemaVersion,
			causationId: this._causationId,
			correlationId: this._correlationId,
		};
	}
}
