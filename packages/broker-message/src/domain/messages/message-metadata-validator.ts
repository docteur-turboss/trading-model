import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { Topic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/validation/domain/contracts/message.types";
import {
	EVENT_TYPE_METADATA_PREDICATE,
	PUBLISHER_METADATA_CONTEXT_PREDICATE,
	SCHEMA_METADATA_VERSION_PREDICATE,
	TOPIC_METADATA_PREDICATE,
} from "../../shared/barrel/message.schema";

export class MessageMetadataValidator {
	validateTopic(topic: Topic): void {
		TOPIC_METADATA_PREDICATE.parse(topic);
	}

	validateEventType(eventType: EventEnumMap): void {
		EVENT_TYPE_METADATA_PREDICATE.parse(eventType);
	}

	validatePublisher(publisher: ServiceIdentity): void {
		PUBLISHER_METADATA_CONTEXT_PREDICATE.parse(publisher);
	}

	validateSchemaVersion(version: string): void {
		SCHEMA_METADATA_VERSION_PREDICATE.parse(version);
	}
}
