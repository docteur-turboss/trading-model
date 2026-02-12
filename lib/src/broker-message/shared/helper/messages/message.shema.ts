import { EnumEventMessage, EventMap } from "config/event.types";
import { ServiceInstanceName } from "config/services.types";
import { DeliveryMode } from "config/deliveryMode.types";
import { z } from "zod";

export const SecurityMetadataContextPredicate = z.object({
  authContext: z.object({
    subject: z.string("authContext.subject must be a string representing the authenticated subject identifier."),
    roles: z.array(
      z.string("authContext.roles must contain only string role identifiers."), "authContext.roles must be an array of role identifiers (string[])."
    ),
    tenantId: z.string("authContext.tenantId must be a string representing the tenant identifier.")
  }).optional(),
  signature: z.string("security.signature must be a string containing the message signature.").optional()
}).optional();

export const DelivryMetadataModePredicate = z.object({
  mode: z.enum(Object.values(DeliveryMode), {
    error: ()=>`delivery.mode value is invalid. Expected one of: ${Object.values(DeliveryMode).join(", ")}.`
  }),
  ttl: z.number("delivery.ttl must be a number representing time-to-live in milliseconds.").int("routing.ttl must be a number").positive("routing.ttl must be positive").optional(),
  deduplicationId: z.string("delivery.deduplicationId must be a string used to prevent duplicate message processing.").optional(),
}).optional();

export const RoutingMetadataContextPredicate = z.object({
  partitionKey: z.string("routing.partitionKey must be a string used for message partitioning.").optional(),
  priority: z.number("routing.priority must be a numeric priority level.").int("routing.priority must be a number").optional(),
}).optional();

export const PublisherMetadataContextPredicate = z.object({
  serviceName: z.enum(Object.values(ServiceInstanceName), `publisher.serviceName value is invalid. Expected one of: ${Object.values(ServiceInstanceName).join(", ")}.`),
  instanceId: z.uuid("publisher.instanceId must be a string as a UUID identifying the service instance"),
})

export const IdsMetadataPredicate = z
  .uuid({
    error: (iss) => `${iss.path?.join(".")} Invalid UUID format. Expected a RFC 4122 compliant UUID (e.g. 550e8400-e29b-41d4-a716-446655440000).`
  })
  .optional();


export const SchemaMetadataVersionPredicate = z.literal(["1.0.0"], {
 error: (iss) => `schemaVersion value '${iss.input}' is invalid. Expected exactly '1.0.0'.`
}).optional();

/* <bounded-context>.<aggregate>.<action> */
export const TopicMetadataPredicate = z.string("Invalid topic format. Expected pattern '<bounded-context>.<aggregate>.<action>' in lowercase (e.g. 'billing.invoice.created').")
.toLowerCase().regex(/[a-z]+\.[a-z]+\.[a-z]+/i);

export const EventTypeMetadataPredicate = z.string("eventType must be a string describing the event type.");

export const MessageMetadataSchema = z.object({
  topic: TopicMetadataPredicate,
  causationId: IdsMetadataPredicate,
  correlationId: IdsMetadataPredicate,
  eventType: EventTypeMetadataPredicate,
  delivery: DelivryMetadataModePredicate,
  routing: RoutingMetadataContextPredicate,
  security: SecurityMetadataContextPredicate,
  publisher: PublisherMetadataContextPredicate,
  schemaVersion: SchemaMetadataVersionPredicate,
})

/* eslint-disable-next-line */
type ZodEventMap<T extends Record<string, any>> = {
  [K in keyof T]:
    [T[K]] extends [void]
      ? z.ZodVoid
      : z.ZodType<T[K]>;
};

const EventValidators: ZodEventMap<EventMap> = {
  [EnumEventMessage.exampleEvent]: z.void(),
  [EnumEventMessage.testEvent]: z.object({
    debug: z.boolean(),
  }),
};

export const MessagePayloadSchema = z.discriminatedUnion("type",
  Object.entries(EventValidators).map(([type, schema]) =>
    z.object({
      type: z.literal(type),
      data: schema,
    })
  ) as [
    /* eslint-disable-next-line */
    z.ZodObject<any>,
    /* eslint-disable-next-line */
    ...z.ZodObject<any>[]
  ]
);

export type MessagePayload = z.infer<typeof MessagePayloadSchema>;