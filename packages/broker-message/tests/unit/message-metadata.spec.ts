import { describe, expect, it } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { MarketEvent } from "@trading-model/contracts/market-events";
import type { Signature } from "@trading-model/contracts/signed-request";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import type {
	CorrelationId,
	DurationMs,
	InstanceId,
	MessagePriority,
	Role,
	ServiceId,
	Subject,
	TenantId,
	Topic,
} from "@trading-model/primitives/primitives";
import { MessageMetadataBuilder } from "../../src/domain/messages/message-metadata-builder";

const TEST_TOPIC = "test.event.created";
const TEST_EVENT = "example.debug.create";
const TEST_PUBLISHER = {
	serviceName: ServiceInstanceName.DiscoveryService as unknown as ServiceId,
	instanceId: "550e8400-e29b-41d4-a716-446655440000" as InstanceId,
};

function buildMinimalMetadata(): MessageMetadataBuilder {
	return new MessageMetadataBuilder(
		TEST_TOPIC as Topic,
		TEST_EVENT,
		TEST_PUBLISHER
	);
}

describe("MessageMetadataBuilder", () => {
	describe("constructor", () => {
		it("should create with required fields", () => {
			const m = new MessageMetadataBuilder(
				TEST_TOPIC as Topic,
				TEST_EVENT,
				TEST_PUBLISHER
			);
			expect(m).toBeInstanceOf(MessageMetadataBuilder);
			expect(m.topic).toBe(TEST_TOPIC);
			expect(m.eventType).toBe(TEST_EVENT);
			expect(m.publisher.serviceName).toBe(
				ServiceInstanceName.DiscoveryService
			);
		});

		it("should throw on invalid topic format", () => {
			expect(
				() =>
					new MessageMetadataBuilder(
						"no-dots" as Topic,
						TEST_EVENT,
						TEST_PUBLISHER
					)
			).toThrow();
		});

		it("should accept the trainer's model-published event", () => {
			const m = new MessageMetadataBuilder(
				TrainingEvent.ModelPublished as unknown as Topic,
				TrainingEvent.ModelPublished,
				TEST_PUBLISHER
			);
			expect(m.toJSON().eventType).toBe(TrainingEvent.ModelPublished);
		});

		it("should accept optional context data", () => {
			const withData = new MessageMetadataBuilder(
				TEST_TOPIC as Topic,
				TEST_EVENT,
				TEST_PUBLISHER,
				{ delivery: { mode: DeliveryMode.AtLeastOnce } }
			);
			const result = withData.toJSON();
			expect(result.topic).toBe(TEST_TOPIC);
			expect(result.eventType).toBe(TEST_EVENT);
			expect(result.delivery?.mode).toBe("at-least-once");
		});
	});

	describe("setTopic", () => {
		it("should set valid topic", () => {
			const m = buildMinimalMetadata();
			m.setTopic("other.event.happened" as Topic);
			expect(m.toJSON().topic).toBe("other.event.happened");
		});

		it("should throw on invalid topic format", () => {
			const m = buildMinimalMetadata();
			expect(() => m.setTopic("" as Topic)).toThrow();
			expect(() => m.setTopic("no-dots" as Topic)).toThrow();
			expect(() => m.setTopic("two.segments" as Topic)).toThrow();
			expect(() => m.setTopic("market..fetch" as Topic)).toThrow();
			expect(() => m.setTopic("market.-trade.fetch" as Topic)).toThrow();
		});

		it.each(Object.values(MarketEvent))(
			"should accept the %s market event as a topic",
			(event) => {
				const m = buildMinimalMetadata();
				m.setTopic(event as unknown as Topic);
				expect(m.toJSON().topic).toBe(event);
			}
		);
	});

	describe("setEventType", () => {
		it("should set event type", () => {
			const m = buildMinimalMetadata();
			m.setEventType("example.show.create");
			expect(m.toJSON().eventType).toBe("example.show.create");
		});
	});

	describe("setPublisher", () => {
		it("should set publisher", () => {
			const m = buildMinimalMetadata();
			m.setPublisher({
				serviceName:
					ServiceInstanceName.DiscoveryService as unknown as ServiceId,
				instanceId: "550e8400-e29b-41d4-a716-446655440000" as InstanceId,
			});
			expect(m.toJSON().publisher.serviceName).toBe(
				ServiceInstanceName.DiscoveryService
			);
		});

		it("should throw on invalid publisher", () => {
			const m = buildMinimalMetadata();
			expect(() => m.setPublisher({} as any)).toThrow();
		});
	});

	describe("toJSON", () => {
		it("should return complete metadata", () => {
			const result = buildMinimalMetadata().toJSON();
			expect(result.topic).toBe(TEST_TOPIC);
			expect(result.eventType).toBe(TEST_EVENT);
			expect(result.schemaVersion).toBe("1.0.0");
			expect(result.publisher.serviceName).toBe(
				ServiceInstanceName.DiscoveryService
			);
		});
	});

	describe("setDelivery", () => {
		it("should set delivery mode", () => {
			const m = buildMinimalMetadata().setDelivery({
				mode: DeliveryMode.AtLeastOnce,
			});
			expect(m.toJSON().delivery?.mode).toBe("at-least-once");
		});

		it("should clear delivery when null", () => {
			const m = buildMinimalMetadata().setDelivery({
				mode: DeliveryMode.AtLeastOnce,
			});
			m.setDelivery(null);
			expect(m.toJSON().delivery).toBeUndefined();
		});
	});

	describe("setRouting", () => {
		it("should set routing info", () => {
			const m = buildMinimalMetadata().setRouting({
				partitionKey: "key-1" as CorrelationId,
			});
			expect(m.toJSON().routing?.partitionKey).toBe("key-1");
		});

		it("should clear routing when null", () => {
			const m = buildMinimalMetadata().setRouting({
				partitionKey: "key-1" as CorrelationId,
			});
			m.setRouting(null);
			expect(m.toJSON().routing).toBeUndefined();
		});

		it("should clear routing when undefined", () => {
			const m = buildMinimalMetadata().setRouting({
				partitionKey: "key-1" as CorrelationId,
			});
			m.setRouting(undefined as any);
			expect(m.toJSON().routing).toBeUndefined();
		});
	});

	describe("setSchemaVersion", () => {
		it("should default to 1.0.0", () => {
			expect(buildMinimalMetadata().toJSON().schemaVersion).toBe("1.0.0");
		});

		it("should reset to default when null", () => {
			const m = buildMinimalMetadata().setSchemaVersion(null);
			expect(m.toJSON().schemaVersion).toBe("1.0.0");
		});

		it("should set a valid schema version", () => {
			const m = buildMinimalMetadata().setSchemaVersion("1.0.0");
			expect(m.toJSON().schemaVersion).toBe("1.0.0");
		});
	});

	describe("setSecurity", () => {
		it("should set security context with authContext", () => {
			const security = {
				authContext: {
					subject: "service-a",
					roles: ["reader"],
					tenantId: "t1",
				},
			};
			const m = buildMinimalMetadata().setSecurity(security as never);
			expect(m.toJSON().security?.authContext?.subject).toBe("service-a");
		});

		it("should clear security when null", () => {
			const m = buildMinimalMetadata().setSecurity({
				authContext: {
					subject: "service-a" as Subject,
					roles: ["reader" as Role],
					tenantId: "t1" as TenantId,
				},
			});
			m.setSecurity(null);
			expect(m.toJSON().security).toBeUndefined();
		});
	});

	describe("setIds", () => {
		it("should set causation and correlation ids", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000" as CorrelationId,
				correlationId: "550e8400-e29b-41d4-a716-446655440001" as CorrelationId,
			});
			const result = m.toJSON();
			expect(result.causationId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(result.correlationId).toBe("550e8400-e29b-41d4-a716-446655440001");
		});

		it("should set only causationId without correlationId", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000" as CorrelationId,
			});
			const result = m.toJSON();
			expect(result.causationId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(result.correlationId).toBeUndefined();
		});

		it("should clear ids when null", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000" as CorrelationId,
				correlationId: "550e8400-e29b-41d4-a716-446655440001" as CorrelationId,
			});
			m.setIds(null);
			const result = m.toJSON();
			expect(result.causationId).toBeUndefined();
			expect(result.correlationId).toBeUndefined();
		});
	});

	describe("toJSON edge cases", () => {
		it("should return metadata with all fields including delivery, routing, security", () => {
			const m = buildMinimalMetadata()
				.setDelivery({
					mode: DeliveryMode.AtLeastOnce,
					ttl: 5000 as DurationMs,
				})
				.setRouting({
					partitionKey: "key-1" as CorrelationId,
					priority: 10 as MessagePriority,
				})
				.setSecurity({
					authContext: {
						subject: "service-a" as Subject,
						roles: ["reader" as Role],
						tenantId: "t1" as TenantId,
					},
					signature: "sig123" as Signature,
				})
				.setIds({
					causationId: "550e8400-e29b-41d4-a716-446655440000" as CorrelationId,
					correlationId:
						"550e8400-e29b-41d4-a716-446655440001" as CorrelationId,
				});
			const result = m.toJSON();
			expect(result.delivery?.mode).toBe("at-least-once");
			expect(result.delivery?.ttl).toBe(5000);
			expect(result.routing?.partitionKey).toBe("key-1");
			expect(result.routing?.priority).toBe(10);
			expect(result.security?.authContext?.subject).toBe("service-a");
			expect(result.security?.authContext?.roles).toEqual(["reader"]);
			expect(result.security?.authContext?.tenantId).toBe("t1");
			expect(result.security?.signature).toBe("sig123");
			expect(result.causationId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(result.correlationId).toBe("550e8400-e29b-41d4-a716-446655440001");
		});
	});

	describe("validation errors", () => {
		it("should throw on invalid delivery mode", () => {
			expect(() =>
				buildMinimalMetadata().setDelivery({ mode: "invalid-mode" } as any)
			).toThrow();
		});

		it("should throw on invalid schema version", () => {
			expect(() => buildMinimalMetadata().setSchemaVersion("2.0.0")).toThrow();
		});

		it("should throw on invalid causation id uuid format", () => {
			expect(() =>
				buildMinimalMetadata().setIds({
					causationId: "not-a-uuid" as CorrelationId,
				})
			).toThrow();
		});

		it("should throw on invalid correlation id uuid format", () => {
			expect(() =>
				buildMinimalMetadata().setIds({
					correlationId: "not-a-uuid" as CorrelationId,
				})
			).toThrow();
		});
	});
});
