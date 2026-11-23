import { describe, expect, it } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import type {
	CorrelationId,
	DurationMs,
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { MessageMetadataBuilder } from "../../src/messages/message-metadata-builder";

const TEST_TOPIC = "test.event.created";
const TEST_EVENT = "training.model.published";
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
	});

	describe("toJSON edge cases", () => {
		it("should return metadata with delivery and ids", () => {
			const m = buildMinimalMetadata()
				.setDelivery({
					mode: DeliveryMode.AtLeastOnce,
					ttl: 5000 as DurationMs,
				})
				.setIds({
					causationId: "550e8400-e29b-41d4-a716-446655440000" as CorrelationId,
					correlationId:
						"550e8400-e29b-41d4-a716-446655440001" as CorrelationId,
				});
			const result = m.toJSON();
			expect(result.delivery?.mode).toBe("at-least-once");
			expect(result.delivery?.ttl).toBe(5000);
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
