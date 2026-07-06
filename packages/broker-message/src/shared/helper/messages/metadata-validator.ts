import { MetadataBuilderError } from "@trading-model/common/utils/errors";
import {
	DELIVERY_METADATA_MODE_PREDICATE,
	EVENT_TYPE_METADATA_PREDICATE,
	IDS_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "./message.schema";
import type {
	DeliveryType,
	RoutingType,
	SecurityType,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";

export class MetadataValidator {
	validateSecurity(context: SecurityType | null): void {
		if (context !== null) {
			SECURITY_METADATA_CONTEXT_PREDICATE.parse(context);
		}
	}

	validateDelivery(context: DeliveryType | null): void {
		if (context !== null) {
			DELIVERY_METADATA_MODE_PREDICATE.parse(context);
		}
	}

	validatePublisher(context: ServiceIdentity): void {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(context);
	}

	validateRouting(context: RoutingType | null): void {
		if (context !== null) {
			ROUTING_METADATA_CONTEXT_PREDICATE.parse(context);
		}
	}

	validateSchemaVersion(version: string | null): void {
		if (version !== null) {
			SCHEMA_METADATA_VERSION_PREDICATE.parse(version);
		}
	}

	validateEventType(event: string): void {
		EVENT_TYPE_METADATA_PREDICATE.parse(event);
	}

	validateTopic(topic: string): void {
		TOPIC_METADATA_PREDICATE.parse(topic);
	}

	validateIds(
		context: {
			causationId?: string;
			correlationId?: string;
		} | null
	): void {
		if (context === null) return;

		if (context.causationId) {
			IDS_METADATA_PREDICATE.parse(context.causationId);
		}

		if (context.correlationId) {
			IDS_METADATA_PREDICATE.parse(context.correlationId);
		}
	}

	assertRequiredFields(
		topic?: string,
		eventType?: string,
		publisher?: ServiceIdentity
	): void {
		if (!topic) {
			throw new MetadataBuilderError("You haven't defined a topic");
		}
		if (!eventType) {
			throw new MetadataBuilderError("You haven't defined a eventType");
		}
		if (!publisher) {
			throw new MetadataBuilderError("You haven't defined a publisher");
		}
	}
}
