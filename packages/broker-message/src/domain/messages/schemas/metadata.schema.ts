import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { AuditEvent } from "@trading-model/contracts/audit-events";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { MarketEvent } from "@trading-model/contracts/market-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import {
	toRole,
	toSubject,
	toTenantId,
} from "@trading-model/primitives/primitives";
import { z } from "zod";

export const SECURITY_METADATA_CONTEXT_PREDICATE = z
	.object({
		authContext: z
			.object({
				subject: z
					.string(
						"authContext.subject must be a string representing the authenticated subject identifier."
					)
					.transform(toSubject),
				roles: z.array(
					z
						.string(
							"authContext.roles must contain only string role identifiers."
						)
						.transform(toRole),
					"authContext.roles must be an array of role identifiers (string[])."
				),
				tenantId: z
					.string(
						"authContext.tenantId must be a string representing the tenant identifier."
					)
					.transform(toTenantId),
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
		requireSubscriber: z
			.boolean(
				"delivery.requireSubscriber must be a boolean: refuse the publish when the topic has no subscriber."
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
	// Same contract as the INSTANCE_ID env var: a pod name in K8s, `<service>-<n>` in compose.
	instanceId: z
		.string(
			"publisher.instanceId must be a non-empty string identifying the service instance"
		)
		.min(1, "publisher.instanceId must not be empty"),
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

const TOPIC_FORMAT_MESSAGE =
	"Invalid topic format. Expected at least '<bounded-context>.<aggregate>.<action>': dot-separated lowercase segments of letters, digits and hyphens (e.g. 'billing.invoice.created', 'market.order-book.snapshot.fetch').";

/** Accepts every topic the contracts define (MarketEvent: 4 segments, hyphens, digits). */
export const TOPIC_METADATA_PREDICATE = z
	.string(TOPIC_FORMAT_MESSAGE)
	.toLowerCase()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){2,}$/, {
		error: TOPIC_FORMAT_MESSAGE,
	});

const ALL_EVENT_TYPES = [
	...Object.values(MarketEvent),
	...Object.values(AuditEvent),
	...Object.values(TrainingEvent),
	...Object.values(DlqEvent),
] as const;

export const EVENT_TYPE_METADATA_PREDICATE = z.enum(
	ALL_EVENT_TYPES as [string, ...string[]],
	{ error: () => "eventType is invalid. Must be a valid event type string." }
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
