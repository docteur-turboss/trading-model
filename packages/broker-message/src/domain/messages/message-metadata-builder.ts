import type { EventEnumMap } from "@trading-model/common/config/event.types";
import {
	type CorrelationId,
	type Topic,
	toTopic,
} from "@trading-model/common/domain/primitives";
import type {
	MessageMetadata as MetadataType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/validation/domain/contracts/message.types";
import {
	type ChainingIds,
	type ChainingMetadata,
	MessageChainingMetadata,
	NULL_MESSAGE_CHAINING_METADATA,
} from "./message-chaining-metadata";
import { MessageContext } from "./message-context";
import { MessageMetadataValidator } from "./message-metadata-validator";

export class MessageMetadataBuilder {
	public topic: Topic;
	public eventType: EventEnumMap;
	public publisher: ServiceIdentity;
	public schemaVersion = "1.0.0" as const;
	private _context: MessageContext;
	private _chaining: ChainingMetadata;
	private readonly _validator = new MessageMetadataValidator();

	public constructor(
		topic: Topic,
		eventType: EventEnumMap,
		publisher: ServiceIdentity,
		data: Partial<Omit<MetadataType, "topic" | "eventType" | "publisher">> = {}
	) {
		this._validator.validateTopic(topic);
		this._validator.validateEventType(eventType);
		this._validator.validatePublisher(publisher);
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

	public setSecurity(context: SecurityType | null): this {
		this._context = this._context.withSecurity(context);
		return this;
	}
	public setDelivery(
		context:
			| import("@trading-model/validation/domain/contracts/message.types").DeliveryType
			| null
	): this {
		this._context = this._context.withDelivery(context);
		return this;
	}
	public setRouting(
		context:
			| import("@trading-model/validation/domain/contracts/message.types").RoutingType
			| null
	): this {
		this._context = this._context.withRouting(context);
		return this;
	}
	public setPublisher(context: ServiceIdentity): this {
		this._validator.validatePublisher(context);
		this.publisher = context;
		return this;
	}
	public setSchemaVersion(version: string | null): this {
		if (version === null) {
			this.schemaVersion = "1.0.0";
			return this;
		}
		this._validator.validateSchemaVersion(version);
		this.schemaVersion = version as "1.0.0";
		return this;
	}
	public setEventType(event: EventEnumMap): this {
		this._validator.validateEventType(event);
		this.eventType = event;
		return this;
	}
	public setTopic(topic: Topic): this {
		this._validator.validateTopic(topic);
		this.topic = toTopic(topic);
		return this;
	}
	public setIds(context: ChainingIds | null): this {
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

	public build(): MetadataType {
		return this.toJSON();
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
