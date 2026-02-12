import { 
	MessageMetadata as MetadataType,
	DeliveryType, 
	IdentifyType, 
	SecurityType,
	RoutingType, 
} from '../../types/message';
import { 
	SecurityMetadataContextPredicate, 
	PublisherMetadataContextPredicate,
	RoutingMetadataContextPredicate,
	SchemaMetadataVersionPredicate,
	DelivryMetadataModePredicate, 
	EventTypeMetadataPredicate,
	TopicMetadataPredicate,
	IdsMetadataPredicate, 
} from './message.shema';

/**
 * Represents an metadata in a message
 */
export class MessageMetadata implements MetadataType {
	public topic: string;
	public eventType: string;
	public causationId?: string;
	public routing?: RoutingType;
	public correlationId?: string;
	public publisher: IdentifyType;
	public delivery?: DeliveryType;
	public security?: SecurityType;
	public schemaVersion = "1.0.0";

	public constructor(data: MetadataType) {
		this.topic = data.topic;
		this.routing = data.routing;
		this.delivery = data.delivery;
		this.security = data.security;
		this.eventType = data.eventType;
		this.publisher = data.publisher;
		this.causationId = data.causationId;
		this.correlationId = data.correlationId;
	}

	/**
	 * Sets the security context of this message
	 *
	 * @param context The context to set.
	 */
	public setSecurity(context: SecurityType | null): this {
		if (context === null) {
			this.security = undefined;
			return this;
		}

		SecurityMetadataContextPredicate.parse(context);

		this.security = context;
		return this;
	}

	/**
	 * Sets the delivery context of this message
	 *
	 * @param context The context for the delivery mode
	 */
	public setDelivery(context: DeliveryType | null): this {
		if (context === null) {
			this.delivery = undefined;
			return this;
		}

		DelivryMetadataModePredicate.parse(context);

		this.delivery = context;
		return this;
	}

	/**
	 * Sets the Author of this message
	 *
	 * @param context The context of the Author.
	 */
	public setPublisher(context: IdentifyType): this {
		PublisherMetadataContextPredicate.parse(context);

		this.publisher = context;
		return this;
	}

	/**
	 * Sets the routing context of this message
	 *
	 * @param context The routing context  of the message
	 */
	public setRouting(context: RoutingType | null): this {
		if (context === null) {
			this.routing = undefined;
			return this;
		}

		// Data assertions
		RoutingMetadataContextPredicate.parse(context);

		this.routing = context ?? undefined;
		return this;
	}

	/**
	 * Sets the version schema used
	 *
	 * @param version The version
	 */
	public setSchemaVersion(version: string | null): this {
		if(version === null) {
			this.schemaVersion = "1.0.0";
			return this
		}

		SchemaMetadataVersionPredicate.parse(version);

		this.schemaVersion = version;
		return this;
	}

	/**
	 * Sets the event type of this message
	 *
	 * @param event The event of this message
	 */
	public setEventType(event: string): this {
		// Data assertions
		EventTypeMetadataPredicate.parse(event);

		this.eventType = event;
		return this;
	}

	/**
	 * Sets the topic of this message
	 *
	 * @param topic The topic of the message
	 */
	public setTopic(topic: string): this {
		// Data assertions
		TopicMetadataPredicate.parse(topic);

		this.topic = topic;
		return this;
	}

	public setIds(context: {
		causationId?: string,
		correlationId?: string
	} | null): this {
		if(context === null) {
			this.causationId = undefined;
			this.correlationId = undefined;
			return this;
		}

		// Data assertions
		if(context.causationId) {
			IdsMetadataPredicate.parse(context?.causationId);
			this.causationId = context.causationId;
		}

		if(context.correlationId) {
			IdsMetadataPredicate.parse(context?.correlationId);
			this.correlationId = context.correlationId;
		}

		return this;
	}

	/**
	 * Transforms the embed to a plain object
	 */
	public toJSON(): MetadataType {
		return { ...this };
	}
}