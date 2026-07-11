import { describe, expect, it } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { MessageMetadata } from "../../src/shared/helper/messages/message";

const TEST_TOPIC = "test.event.created";
const TEST_EVENT = "example.debug.create";
const TEST_PUBLISHER = {
	serviceName: ServiceInstanceName.DiscoveryService,
	instanceId: "550e8400-e29b-41d4-a716-446655440000",
};

function buildMinimalMetadata(): MessageMetadata {
	return new MessageMetadata(TEST_TOPIC, TEST_EVENT, TEST_PUBLISHER);
}

describe("MessageMetadata", () => {
	describe("constructor", () => {
		it("should create with required fields", () => {
			const m = new MessageMetadata(TEST_TOPIC, TEST_EVENT, TEST_PUBLISHER);
			expect(m).toBeInstanceOf(MessageMetadata);
			expect(m.topic).toBe(TEST_TOPIC);
			expect(m.eventType).toBe(TEST_EVENT);
			expect(m.publisher.serviceName).toBe(
				ServiceInstanceName.DiscoveryService
			);
		});

		it("should throw on invalid topic format", () => {
			expect(
				() => new MessageMetadata("no-dots", TEST_EVENT, TEST_PUBLISHER)
			).toThrow();
		});

		it("should accept optional context data", () => {
			const withData = new MessageMetadata(
				TEST_TOPIC,
				TEST_EVENT,
				TEST_PUBLISHER,
				{ delivery: { mode: "at-least-once" } }
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
			m.setTopic("other.event.happened");
			expect(m.toJSON().topic).toBe("other.event.happened");
		});

		it("should throw on invalid topic format", () => {
			const m = buildMinimalMetadata();
			expect(() => m.setTopic("")).toThrow();
			expect(() => m.setTopic("no-dots")).toThrow();
		});
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
				serviceName: ServiceInstanceName.DiscoveryService,
				instanceId: "550e8400-e29b-41d4-a716-446655440000",
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
			const m = buildMinimalMetadata().setDelivery({ mode: "at-least-once" });
			expect(m.toJSON().delivery?.mode).toBe("at-least-once");
		});

		it("should clear delivery when null", () => {
			const m = buildMinimalMetadata().setDelivery({ mode: "at-least-once" });
			m.setDelivery(null);
			expect(m.toJSON().delivery).toBeUndefined();
		});
	});

	describe("setRouting", () => {
		it("should set routing info", () => {
			const m = buildMinimalMetadata().setRouting({ partitionKey: "key-1" });
			expect(m.toJSON().routing?.partitionKey).toBe("key-1");
		});

		it("should clear routing when null", () => {
			const m = buildMinimalMetadata().setRouting({ partitionKey: "key-1" });
			m.setRouting(null);
			expect(m.toJSON().routing).toBeUndefined();
		});

		it("should clear routing when undefined", () => {
			const m = buildMinimalMetadata().setRouting({ partitionKey: "key-1" });
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
			const m = buildMinimalMetadata().setSecurity(security);
			expect(m.toJSON().security?.authContext?.subject).toBe("service-a");
		});

		it("should clear security when null", () => {
			const m = buildMinimalMetadata().setSecurity({
				authContext: {
					subject: "service-a",
					roles: ["reader"],
					tenantId: "t1",
				},
			});
			m.setSecurity(null);
			expect(m.toJSON().security).toBeUndefined();
		});
	});

	describe("setIds", () => {
		it("should set causation and correlation ids", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000",
				correlationId: "550e8400-e29b-41d4-a716-446655440001",
			});
			const result = m.toJSON();
			expect(result.causationId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(result.correlationId).toBe("550e8400-e29b-41d4-a716-446655440001");
		});

		it("should set only causationId without correlationId", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000",
			});
			const result = m.toJSON();
			expect(result.causationId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(result.correlationId).toBeUndefined();
		});

		it("should clear ids when null", () => {
			const m = buildMinimalMetadata().setIds({
				causationId: "550e8400-e29b-41d4-a716-446655440000",
				correlationId: "550e8400-e29b-41d4-a716-446655440001",
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
					mode: "at-least-once",
					ttl: 5000,
					deduplicationId: "dedup-1",
				})
				.setRouting({ partitionKey: "key-1", priority: 10 })
				.setSecurity({
					authContext: {
						subject: "service-a",
						roles: ["reader"],
						tenantId: "t1",
					},
					signature: "sig123",
				})
				.setIds({
					causationId: "550e8400-e29b-41d4-a716-446655440000",
					correlationId: "550e8400-e29b-41d4-a716-446655440001",
				});
			const result = m.toJSON();
			expect(result.delivery?.mode).toBe("at-least-once");
			expect(result.delivery?.ttl).toBe(5000);
			expect(result.delivery?.deduplicationId).toBe("dedup-1");
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
				buildMinimalMetadata().setIds({ causationId: "not-a-uuid" })
			).toThrow();
		});

		it("should throw on invalid correlation id uuid format", () => {
			expect(() =>
				buildMinimalMetadata().setIds({ correlationId: "not-a-uuid" })
			).toThrow();
		});
	});
});
