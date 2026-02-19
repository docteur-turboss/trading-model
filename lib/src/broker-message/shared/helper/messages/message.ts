import { MetadataBuilderError } from 'utils/Errors';
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
export class MessageMetadata {
	private topic: string;
	private eventType: string;
	private causationId?: string;
	private routing?: RoutingType;
	private correlationId?: string;
	private publisher: IdentifyType;
	private delivery?: DeliveryType;
	private security?: SecurityType;
	private schemaVersion = "1.0.0";

	public constructor(data: Partial<MetadataType> = {}) {
		const { topic, routing, delivery, security, eventType, publisher, causationId, correlationId } = data;
		
		this.routing = routing;
		this.delivery = delivery;
		this.security = security;
		this.causationId = causationId;
		this.correlationId = correlationId;
		this.topic = topic? topic : "null";
		this.eventType = eventType? eventType : "null";

		this.publisher = publisher? publisher : {
			serviceName: "MessageDeliveryService",
			instanceId: "null"
		};
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
		const { eventType, publisher, schemaVersion, topic, causationId, correlationId, delivery, routing, security } = this;
		
		if(topic === "null") throw new MetadataBuilderError("You haven't defined a topic");
		if(eventType === "null") throw new MetadataBuilderError("You haven't defined a eventType");
		if(publisher.instanceId === "null" && this.publisher.serviceName === "MessageDeliveryService") throw new MetadataBuilderError("You haven't defined a publisher");
		
		return { eventType, publisher, schemaVersion, topic, causationId, correlationId, delivery, routing, security };
	}
}