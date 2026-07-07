import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { z } from "zod";

export const SECURITY_METADATA_CONTEXT_PREDICATE = z
	.object({
		authContext: z
			.object({
				subject: z.string(
					"authContext.subject must be a string representing the authenticated subject identifier."
				),
				roles: z.array(
					z.string(
						"authContext.roles must contain only string role identifiers."
					),
					"authContext.roles must be an array of role identifiers (string[])."
				),
				tenantId: z.string(
					"authContext.tenantId must be a string representing the tenant identifier."
				),
			})
			.optional(),
		signature: z
			.string(
				"security.signature must be a string containing the message signature."
			)
			.optional(),
	})
	.optional();

export const DELIVERY_METADATA_MODE_PREDICATE = z
	.object({
		mode: z.enum(Object.values(DeliveryMode), {
			error: () =>
				`delivery.mode value is invalid. Expected one of: ${Object.values(DeliveryMode).join(", ")}.`,
		}),
		ttl: z
			.number(
				"delivery.ttl must be a number representing time-to-live in milliseconds."
			)
			.int("delivery.ttl must be a number")
			.positive("delivery.ttl must be positive")
			.optional(),
		deduplicationId: z
			.string(
				"delivery.deduplicationId must be a string used to prevent duplicate message processing."
			)
			.optional(),
	})
	.optional();

export const ROUTING_METADATA_CONTEXT_PREDICATE = z
	.object({
		partitionKey: z
			.string(
				"routing.partitionKey must be a string used for message partitioning."
			)
			.optional(),
		priority: z
			.number("routing.priority must be a numeric priority level.")
			.int("routing.priority must be a number")
			.optional(),
	})
	.optional();

export const PUBLISHER_METADATA_CONTEXT_PREDICATE = z.object({
	serviceName: z.enum(
		Object.values(ServiceInstanceName) as [string, ...string[]],
		`publisher.serviceName value is invalid. Expected one of: ${Object.values(ServiceInstanceName).join(", ")}.`
	),
	instanceId: z.uuid(
		"publisher.instanceId must be a string as a UUID identifying the service instance"
	),
});

export const IDS_METADATA_PREDICATE = z
	.uuid({
		error: (iss) =>
			`${iss.path?.join(".")} Invalid UUID format. Expected a RFC 4122 compliant UUID (e.g. 550e8400-e29b-41d4-a716-446655440000).`,
	})
	.optional();

export const SCHEMA_METADATA_VERSION_PREDICATE = z
	.literal(["1.0.0"], {
		error: (iss) =>
			`schemaVersion value '${iss.input}' is invalid. Expected exactly '1.0.0'.`,
	})
	.optional();

export const TOPIC_METADATA_PREDICATE = z
	.string(
		"Invalid topic format. Expected pattern '<bounded-context>.<aggregate>.<action>' in lowercase (e.g. 'billing.invoice.created')."
	)
	.toLowerCase()
	.regex(/^[a-z]+\.[a-z]+\.[a-z]+$/);

export const EVENT_TYPE_METADATA_PREDICATE = z.string(
	"eventType must be a string describing the event type."
);

export const MESSAGE_METADATA_SCHEMA = z.object({
	topic: TOPIC_METADATA_PREDICATE,
	causationId: IDS_METADATA_PREDICATE,
	correlationId: IDS_METADATA_PREDICATE,
	eventType: EVENT_TYPE_METADATA_PREDICATE,
	delivery: DELIVERY_METADATA_MODE_PREDICATE,
	routing: ROUTING_METADATA_CONTEXT_PREDICATE,
	security: SECURITY_METADATA_CONTEXT_PREDICATE,
	publisher: PUBLISHER_METADATA_CONTEXT_PREDICATE,
	schemaVersion: SCHEMA_METADATA_VERSION_PREDICATE,
});
