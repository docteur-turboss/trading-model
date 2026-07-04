import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import {
	EnumEventMessage,
	type EventMap,
	MarketType,
	SourceType,
} from "@trading-model/common/config/event.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { z } from "zod";

/** Validates the security metadata context (auth and signature). */
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

/** Validates the delivery mode metadata (mode, ttl, deduplication). */
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

/** Validates the routing metadata context (partition key, priority). */
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

/** Validates the publisher identity metadata. */
export const PUBLISHER_METADATA_CONTEXT_PREDICATE = z.object({
	serviceName: z.enum(
		Object.values(ServiceInstanceName) as [string, ...string[]],
		`publisher.serviceName value is invalid. Expected one of: ${Object.values(ServiceInstanceName).join(", ")}.`
	),
	instanceId: z.uuid(
		"publisher.instanceId must be a string as a UUID identifying the service instance"
	),
});

/** Validates a UUID-formatted identifier. */
export const IDS_METADATA_PREDICATE = z
	.uuid({
		error: (iss) =>
			`${iss.path?.join(".")} Invalid UUID format. Expected a RFC 4122 compliant UUID (e.g. 550e8400-e29b-41d4-a716-446655440000).`,
	})
	.optional();

/** Validates the schema version literal ('1.0.0'). */
export const SCHEMA_METADATA_VERSION_PREDICATE = z
	.literal(["1.0.0"], {
		error: (iss) =>
			`schemaVersion value '${iss.input}' is invalid. Expected exactly '1.0.0'.`,
	})
	.optional();

/** Validates a topic string in the format '<bounded-context>.<aggregate>.<action>'. */
export const TOPIC_METADATA_PREDICATE = z
	.string(
		"Invalid topic format. Expected pattern '<bounded-context>.<aggregate>.<action>' in lowercase (e.g. 'billing.invoice.created')."
	)
	.toLowerCase()
	.regex(/^[a-z]+\.[a-z]+\.[a-z]+$/);

/** Validates the event type string. */
export const EVENT_TYPE_METADATA_PREDICATE = z.string(
	"eventType must be a string describing the event type."
);

/** Validates the complete message metadata object. */
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

type ZodEventMap<TObject extends object> = {
	[TKey in keyof TObject]: [TObject[TKey]] extends [undefined]
		? z.ZodVoid
		: z.ZodType<TObject[TKey]>;
};

const SET_OBJECT = z.object({
	price: z.number(),
	quantity: z.number(),
});

const EVENT_VALIDATORS: ZodEventMap<EventMap> = {
	[EnumEventMessage.exampleEvent]: z.void(),
	[EnumEventMessage.testEvent]: z.object({
		debug: z.boolean("Debug must be a boolean and is required"),
	}),
	[EnumEventMessage.fetchRecentTrades]: z.object({
		trades: z.array(
			z.object({
				price: z.number("Price is required and must be a number"),
				symbol: z.string("Symbol is required and must be a string"),
				tradeId: z.bigint("TradeId is required and must be a bigint"),
				quantity: z.number("Quantity is required and must be a number"),
				timestamp: z.number("Timestamp is required and must be a number"),
				side: z.enum(
					["buy", "sell"],
					"Side is required and must be `buy` or `sell`"
				),
				source: z.enum(
					SourceType,
					`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
				),
				market: z.enum(
					MarketType,
					`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
				),
			}),
			"Trades is required and must be a array of object"
		),
	}),
	[EnumEventMessage.fetch24hrTickerStats]: z.object({
		ticker: z.array(
			z.object({
				low: z.number("Low is required and must be a number"),
				open: z.number("Open is required and must be a number"),
				high: z.number("High is required and must be a number"),
				last: z.number("Last is required and must be a number"),
				volume: z.number("Volume is required and must be a number"),
				symbol: z.string("Symbol is required and must be a string"),
				timestamp: z.number("Timestamp is required and must be a number"),
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				source: z.enum(
					SourceType,
					`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
				),
				market: z.enum(
					MarketType,
					`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
				),
			}),
			"Ticker is required and must be a array of object"
		),
	}),
	[EnumEventMessage.fetchCandlestickSeries]: z.object({
		candle: z.array(
			z.object({
				low: z.number("Low is required and must be a number"),
				trades: z.number("Trades must be a number").optional(),
				open: z.number("Open is required and must be a number"),
				high: z.number("High is required and must be a number"),
				close: z.number("Close is required and must be a number"),
				symbol: z.string("Symbol is required and must be a string"),
				volume: z.number("Volume is required and must be a number"),
				interval: z.string("Interval is required and must be a string"),
				timestamp: z.number("Timestamp is required and must be a number"),
				closeTimestamp: z.number(
					"CloseTimestamp is required and must be a number"
				),
				source: z.enum(
					SourceType,
					`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
				),
				market: z.enum(
					MarketType,
					`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
				),
			}),
			"Candle is required and must be a array of object"
		),
	}),
	[EnumEventMessage.fetchOrderBookSnapshot]: z.object({
		orderBook: z.array(
			z.object({
				bids: z.set(SET_OBJECT),
				asks: z.set(SET_OBJECT),
				symbol: z.string("Symbol is required and must be a string"),
				timestamp: z.number("Timestamp is required and must be a number"),
				source: z.enum(
					SourceType,
					`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
				),
				market: z.enum(
					MarketType,
					`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
				),
			}),
			"OrderBook is required and must be a array of object"
		),
	}),
	[EnumEventMessage.fetchPriceTickerSnapshot]: z.object({
		price: z.record(
			z.string("Symbol value must be string"),
			z.number("Price value must be a number"),
			"Price param is required and must be a record<string, number>"
		),
	}),
	[EnumEventMessage.fetchOrderBookTickerSnapshot]: z.object({
		bookTicker: z.array(
			z.object({
				ask: z.number("Ask is required and must be a number"),
				bid: z.number("Bid is required and must be a number"),
				askQty: z.number("AskQty is required and must be a number"),
				bidQty: z.number("BidQty is required and must be a number"),
				symbol: z.string("Symbol is required and must be a string"),
				timestamp: z.number("Timestamp is required and must be a number"),
				source: z.enum(
					SourceType,
					`Source is required and must be part of: ${Object.values(SourceType).join(", ")}`
				),
				market: z.enum(
					MarketType,
					`Market is required and must be part of: ${Object.values(MarketType).join(", ")}`
				),
			}),
			"BookTicker is required and must be a array of object"
		),
	}),

	[EnumEventMessage.auditHeartbeat]: z.object({
		serviceName: z.string(),
		instanceId: z.string(),
	}),
	[EnumEventMessage.auditGapDetected]: z.object({
		from: z.string().transform((str) => new Date(str)),
		to: z.string().transform((str) => new Date(str)),
		lostCount: z.number().int().optional(),
	}),
	[EnumEventMessage.certificateRevoked]: z.object({
		serialNumber: z.string(),
		serviceId: z.string(),
		reason: z.string(),
		revokedAt: z.string(),
		instanceId: z.string(),
	}),
	[EnumEventMessage.caKeyRotated]: z.object({
		keyId: z.string(),
		keyVersion: z.number(),
		instanceId: z.string(),
	}),
};

/** Validates the message payload as a discriminated union by event type. */
export const MESSAGE_PAYLOAD_SCHEMA = z.discriminatedUnion(
	"type",
	Object.entries(EVENT_VALIDATORS).map(([type, schema]) =>
		z.object({
			type: z.literal(type),
			data: schema,
		})
	) as unknown as [z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]]
);

/** Inferred type from the MESSAGE_PAYLOAD_SCHEMA. */
export type MessagePayload = z.infer<typeof MESSAGE_PAYLOAD_SCHEMA>;
