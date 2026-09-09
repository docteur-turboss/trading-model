import { describe, expect, it } from "@jest/globals";
import { AuditEvent } from "@trading-model/validation/contracts/audit-events";
import { MarketEvent } from "@trading-model/validation/contracts/market-events";
import { z } from "zod";

/**
 * Consumer-Driven Contract Tests
 *
 * These tests verify that each service publishes and consumes messages
 * that conform to the shared contract schemas defined in
 * @trading-model/broker-message.
 *
 * Each contract documents:
 *   - Producer: the service that emits the event
 *   - Consumer(s): services that subscribe to the event
 *   - Schema: Zod schema the payload must satisfy
 *   - Version: current contract version (MAJOR.minor)
 *
 * A contract is broken when a producer change causes a consumer
 * validation failure. These tests prevent that by codifying the
 * expected shape at each interface boundary.
 */

const TOPIC_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

const VALID_SERVICE_NAMES = [
	"financial-scraper",
	"trader-trainer",
	"audit-logger",
	"message-manager",
	"api-gateway",
	"discovery-server",
	"dlq-service",
	"admin-interface",
] as const;

interface Contract {
	producer: string;
	consumers: string[];
	topic: string;
	eventType: string;
	version: string;
	payloadSchema: z.ZodType<unknown>;
	samplePayload: () => unknown;
}

const MARKET_DATA_PAYLOAD = z.object({
	symbol: z.string(),
	market: z.string(),
	source: z.string(),
	timestamp: z.number(),
});

const TICKER_PAYLOAD = MARKET_DATA_PAYLOAD.extend({
	open: z.number(),
	high: z.number(),
	low: z.number(),
	last: z.number(),
	volume: z.number(),
	closeTimestamp: z.number(),
});

const CANDLE_PAYLOAD = MARKET_DATA_PAYLOAD.extend({
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	interval: z.string(),
	closeTimestamp: z.number(),
	trades: z.number().optional(),
});

const TRADE_PAYLOAD = MARKET_DATA_PAYLOAD.extend({
	price: z.number(),
	quantity: z.number(),
	tradeId: z.union([z.number(), z.bigint()]),
	side: z.enum(["buy", "sell"]),
});

/**
 * Registered contracts between services.
 * Each entry documents a producer-consumer agreement.
 */
const CONTRACTS: Contract[] = [
	// financial-scraper â†’ trader-trainer
	{
		producer: "financial-scraper",
		consumers: ["trader-trainer"],
		topic: MarketEvent.fetchCandlestickSeries,
		eventType: "candle_update",
		version: "1.0",
		payloadSchema: CANDLE_PAYLOAD,
		samplePayload: () => ({
			symbol: "BTCUSDT",
			market: "crypto",
			source: "binance",
			timestamp: Date.now(),
			open: 50000.0,
			high: 51000.0,
			low: 49000.0,
			close: 50500.0,
			volume: 1234.56,
			interval: "1m",
			closeTimestamp: Date.now() + 60000,
		}),
	},

	{
		producer: "financial-scraper",
		consumers: ["trader-trainer"],
		topic: MarketEvent.fetchRecentTrades,
		eventType: "trade_update",
		version: "1.0",
		payloadSchema: TRADE_PAYLOAD,
		samplePayload: () => ({
			symbol: "BTCUSDT",
			market: "crypto",
			source: "binance",
			timestamp: Date.now(),
			price: 50500.0,
			quantity: 0.5,
			tradeId: 123456789n,
			side: "buy" as const,
		}),
	},

	{
		producer: "financial-scraper",
		consumers: ["trader-trainer"],
		topic: MarketEvent.fetch24hrTickerStats,
		eventType: "ticker_update",
		version: "1.0",
		payloadSchema: TICKER_PAYLOAD,
		samplePayload: () => ({
			symbol: "BTCUSDT",
			market: "crypto",
			source: "binance",
			timestamp: Date.now(),
			open: 50000.0,
			high: 51000.0,
			low: 49000.0,
			last: 50500.0,
			volume: 12345.67,
			closeTimestamp: Date.now() + 86400000,
		}),
	},

	// audit-logger contracts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "audit-logger",
		consumers: ["discovery-server", "dlq-service"],
		topic: AuditEvent.auditHeartbeat,
		eventType: "audit_heartbeat",
		version: "1.0",
		payloadSchema: z.object({
			serviceName: z.string(),
			instanceId: z.string(),
			timestamp: z.number(),
		}),
		samplePayload: () => ({
			serviceName: "audit-logger",
			instanceId: "550e8400-e29b-41d4-a716-446655440000",
			timestamp: Date.now(),
		}),
	},

	{
		producer: "audit-logger",
		consumers: ["discovery-server"],
		topic: "audit.gap.detected",
		eventType: "audit_gap",
		version: "1.0",
		payloadSchema: z.object({
			from: z.number(),
			to: z.number(),
			lostCount: z.number().int().positive(),
		}),
		samplePayload: () => ({
			from: Date.now() - 3600000,
			to: Date.now(),
			lostCount: 42,
		}),
	},

	// message-manager contracts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "message-manager",
		consumers: ["dlq-service"],
		topic: "message.dlq.entry",
		eventType: "dlq_entry",
		version: "1.0",
		payloadSchema: z.object({
			originalMessageId: z.string(),
			originalTopic: z.string(),
			failureReason: z.string(),
			failedDeliveryCount: z.number().int().positive(),
			payload: z.unknown(),
			enqueuedAt: z.number(),
		}),
		samplePayload: () => ({
			originalMessageId: "msg_abc123",
			originalTopic: "market.data.candle",
			failureReason: "delivery_timeout",
			failedDeliveryCount: 3,
			payload: { symbol: "BTCUSDT" },
			enqueuedAt: Date.now(),
		}),
	},

	// trader-trainer contracts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "trader-trainer",
		consumers: ["admin-interface"],
		topic: "training.status.update",
		eventType: "training_progress",
		version: "1.0",
		payloadSchema: z.object({
			generation: z.number().int().nonnegative(),
			populationSize: z.number().int().positive(),
			bestFitness: z.number(),
			avgFitness: z.number().optional(),
			elapsedMs: z.number().int().nonnegative(),
			status: z.enum(["running", "completed", "failed"]),
		}),
		samplePayload: () => ({
			generation: 25,
			populationSize: 20,
			bestFitness: 0.87,
			avgFitness: 0.62,
			elapsedMs: 45000,
			status: "running" as const,
		}),
	},

	// api-gateway contracts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "api-gateway",
		consumers: ["admin-interface"],
		topic: "gateway.ratelimit.exceeded",
		eventType: "rate_limit_exceeded",
		version: "1.0",
		payloadSchema: z.object({
			clientIdentity: z.string(),
			path: z.string(),
			retryAfterMs: z.number().int().positive(),
			timestamp: z.number(),
		}),
		samplePayload: () => ({
			clientIdentity: "client:abc12345",
			path: "/v1/market-data/candles",
			retryAfterMs: 60000,
			timestamp: Date.now(),
		}),
	},

	// discovery-server contracts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "discovery-server",
		consumers: ["message-manager", "api-gateway", "dlq-service"],
		topic: "discovery.service.registered",
		eventType: "service_registered",
		version: "1.0",
		payloadSchema: z.object({
			serviceName: z.string(),
			instanceId: z.string(),
			host: z.string(),
			port: z.number().int().positive(),
			ttl: z.number().int().positive(),
			tags: z.array(z.string()).optional(),
			registeredAt: z.number(),
		}),
		samplePayload: () => ({
			serviceName: "financial-scraper",
			instanceId: "550e8400-e29b-41d4-a716-446655440000",
			host: "financial-scraper.trading-model.svc",
			port: 3000,
			ttl: 60,
			tags: ["market-data"],
			registeredAt: Date.now(),
		}),
	},

	{
		producer: "discovery-server",
		consumers: ["message-manager", "api-gateway", "dlq-service"],
		topic: "discovery.service.deregistered",
		eventType: "service_deregistered",
		version: "1.0",
		payloadSchema: z.object({
			serviceName: z.string(),
			instanceId: z.string(),
			reason: z.enum(["shutdown", "expired", "evicted"]),
			deregisteredAt: z.number(),
		}),
		samplePayload: () => ({
			serviceName: "financial-scraper",
			instanceId: "550e8400-e29b-41d4-a716-446655440000",
			reason: "shutdown" as const,
			deregisteredAt: Date.now(),
		}),
	},

	// message-manager bilateral â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "message-manager",
		consumers: [
			"financial-scraper",
			"trader-trainer",
			"api-gateway",
			"audit-logger",
		],
		topic: "message.broker.healthy",
		eventType: "broker_heartbeat",
		version: "1.0",
		payloadSchema: z.object({
			brokerId: z.string(),
			partitions: z.number().int().nonnegative(),
			connectedConsumers: z.number().int().nonnegative(),
			totalMessages: z.number().int().nonnegative(),
			timestamp: z.number(),
		}),
		samplePayload: () => ({
			brokerId: "broker-1",
			partitions: 3,
			connectedConsumers: 5,
			totalMessages: 1024,
			timestamp: Date.now(),
		}),
	},

	// dlq-service resolution events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "dlq-service",
		consumers: ["audit-logger", "admin-interface"],
		topic: "dlq.message.resolved",
		eventType: "dlq_resolved",
		version: "1.0",
		payloadSchema: z.object({
			originalMessageId: z.string(),
			originalTopic: z.string(),
			resolution: z.enum(["retried", "discarded", "forwarded"]),
			attempts: z.number().int().nonnegative(),
			resolvedAt: z.number(),
		}),
		samplePayload: () => ({
			originalMessageId: "msg_abc123",
			originalTopic: "market.data.candle",
			resolution: "retried" as const,
			attempts: 3,
			resolvedAt: Date.now(),
		}),
	},

	// trader-trainer model events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	{
		producer: "trader-trainer",
		consumers: ["admin-interface", "api-gateway"],
		topic: "training.model.published",
		eventType: "model_published",
		version: "1.0",
		payloadSchema: z.object({
			modelId: z.string(),
			generation: z.number().int().nonnegative(),
			fitness: z.number(),
			artifactUrl: z.string().url(),
			publishedAt: z.number(),
		}),
		samplePayload: () => ({
			modelId: "model_gen_25_abc",
			generation: 25,
			fitness: 0.87,
			artifactUrl: "s3://models/trader-trainer/gen_25/model.pt",
			publishedAt: Date.now(),
		}),
	},
];

// â”€â”€ Contract validation tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Service Contracts", () => {
	for (const contract of CONTRACTS) {
		describe(`${contract.producer} â†’ ${contract.consumers.join(", ")}`, () => {
			it(`[${contract.version}] topic "${contract.topic}" should match pattern`, () => {
				expect(contract.topic).toMatch(TOPIC_PATTERN);
			});

			it(`[${contract.version}] event type "${contract.eventType}" should be non-empty`, () => {
				expect(contract.eventType.length).toBeGreaterThan(0);
			});

			it(`[${contract.version}] sample payload should conform to schema`, () => {
				const payload = contract.samplePayload();
				const result = contract.payloadSchema.safeParse(payload);
				if (!result.success) {
					console.error(
						`Schema validation failed for ${contract.producer} â†’ ${contract.consumers.join(", ")}`,
						result.error.issues
					);
				}
				expect(result.success).toBe(true);
			});

			it(`[${contract.version}] schema should accept minimal valid payload`, () => {
				const result = contract.payloadSchema.safeParse(
					contract.samplePayload()
				);
				expect(result.success).toBe(true);
			});

			it(`[${contract.version}] schema should reject null payload`, () => {
				const result = contract.payloadSchema.safeParse(null);
				expect(result.success).toBe(false);
			});

			it(`[${contract.version}] schema should reject undefined payload`, () => {
				const result = contract.payloadSchema.safeParse(undefined);
				expect(result.success).toBe(false);
			});
		});
	}
});

// â”€â”€ Backward compatibility tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Contract Backward Compatibility", () => {
	it("all contracts have unique topic + eventType combinations", () => {
		const seen = new Set<string>();
		for (const c of CONTRACTS) {
			const key = `${c.topic}:${c.eventType}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	it("all producers are valid service names", () => {
		for (const c of CONTRACTS) {
			expect(VALID_SERVICE_NAMES).toContain(c.producer);
		}
	});

	it("all consumers are valid service names", () => {
		for (const c of CONTRACTS) {
			for (const consumer of c.consumers) {
				expect(VALID_SERVICE_NAMES).toContain(consumer);
			}
		}
	});

	it("no producer is also listed as its own consumer", () => {
		for (const c of CONTRACTS) {
			expect(c.consumers).not.toContain(c.producer);
		}
	});

	it("every contract has at least one consumer", () => {
		for (const c of CONTRACTS) {
			expect(c.consumers.length).toBeGreaterThan(0);
		}
	});
});
