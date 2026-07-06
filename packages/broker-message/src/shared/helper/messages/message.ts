import type {
	MessageMetadata as MetadataType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import {
	type Topic,
	toTopic,
} from "@trading-model/common/domain/primitives";
import { metadataBuilderError } from "@trading-model/common/utils/errors";

import {
	EVENT_TYPE_METADATA_PREDICATE,
	MESSAGE_METADATA_SCHEMA,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import { MessageContextMetadata } from "./message-context-metadata";
import { MessageIdsMetadata } from "./message-ids-metadata";

export class MessageMetadata {
	public topic?: Topic;
	public eventType?: string;
	public publisher?: ServiceIdentity;
	public schemaVersion = "1.0.0";
	private readonly _context = new MessageContextMetadata();
	private readonly _ids = new MessageIdsMetadata();

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
		this.topic = topic!;
		this.eventType = eventType!;
		this.publisher = publisher!;
		this._context.assignFromData({ routing, delivery, security });
		this._ids.assignFromData({ causationId, correlationId });
	}

	public setSecurity(context: import("@trading-model/common/contracts/message.types").SecurityType | null): this {
		return this._context.setSecurity(context);
	}

	public setDelivery(context: import("@trading-model/common/contracts/message.types").DeliveryType | null): this {
		return this._context.setDelivery(context);
	}

	public setPublisher(context: ServiceIdentity): this {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);

		this.publisher = context;
		return this;
	}

	public setRouting(context: import("@trading-model/common/contracts/message.types").RoutingType | null): this {
		return this._context.setRouting(context);
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
		return this._ids.setIds(context);
	}

	private _assertRequiredFields(): void {
		if (!this.topic) {
			throw metadataBuilderError("Topic is required");
		}
		if (!this.eventType) {
			throw metadataBuilderError("Event type is required");
		}
		if (!this.publisher) {
			throw metadataBuilderError("Publisher is required");
		}
	}

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
			causationId: this._ids.causationId,
			correlationId: this._ids.correlationId,
			delivery: this._context.delivery,
			routing: this._context.routing,
			security: this._context.security,
		};
	}
}
