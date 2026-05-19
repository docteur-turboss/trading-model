import { describe, it, expect } from "@jest/globals";
import { DeliveryMode } from "@trading-model/common/config/deliveryMode.types";
import {
  SubscribeSchema,
  UnsubscribeSchema,
  PublishSchema,
  PublishMetadataSchema,
} from "../../../../../src/messaging/transport/validation/broker.schema";

describe("Broker Schemas", () => {
  describe("SubscribeSchema", () => {
    it("should accept valid subscription data", () => {
      const result = SubscribeSchema.safeParse({
        topic: "test.topic",
        callbackPath: "message/callback",
        consumerIdentity: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty topic", () => {
      const result = SubscribeSchema.safeParse({
        topic: "",
        callbackPath: "message/callback",
        consumerIdentity: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing callbackPath", () => {
      const result = SubscribeSchema.safeParse({
        topic: "test.topic",
        consumerIdentity: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid serviceName", () => {
      const result = SubscribeSchema.safeParse({
        topic: "test.topic",
        callbackPath: "message/callback",
        consumerIdentity: {
          serviceName: "nonexistent-service",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("UnsubscribeSchema", () => {
    it("should accept valid unsubscribe data", () => {
      const result = UnsubscribeSchema.safeParse({
        topic: "test.topic",
        instanceId: "instance-1",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty instanceId", () => {
      const result = UnsubscribeSchema.safeParse({
        topic: "test.topic",
        instanceId: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("PublishMetadataSchema", () => {
    it("should accept valid metadata", () => {
      const result = PublishMetadataSchema.safeParse({
        schemaVersion: "1.0",
        eventType: "TestEvent",
        topic: "test.topic",
        publisher: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should accept metadata with all optional fields", () => {
      const result = PublishMetadataSchema.safeParse({
        correlationId: "corr-123",
        schemaVersion: "1.0",
        causationId: "caus-456",
        eventType: "TestEvent",
        topic: "test.topic",
        publisher: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
        routing: {
          partitionKey: "key-1",
          priority: 10,
        },
        delivery: {
          mode: DeliveryMode.AT_LEAST_ONCE,
          ttl: 60000,
          deduplicationId: "dedup-789",
        },
        security: {
          authContext: { user: "test" },
          signature: "sig-abc",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing schemaVersion", () => {
      const result = PublishMetadataSchema.safeParse({
        eventType: "TestEvent",
        topic: "test.topic",
        publisher: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid delivery mode", () => {
      const result = PublishMetadataSchema.safeParse({
        schemaVersion: "1.0",
        eventType: "TestEvent",
        topic: "test.topic",
        publisher: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
        delivery: {
          mode: "INVALID_MODE",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject negative TTL", () => {
      const result = PublishMetadataSchema.safeParse({
        schemaVersion: "1.0",
        eventType: "TestEvent",
        topic: "test.topic",
        publisher: {
          serviceName: "FinancialScrapperService",
          instanceId: "instance-1",
        },
        delivery: {
          mode: DeliveryMode.AT_LEAST_ONCE,
          ttl: -1,
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("PublishSchema", () => {
    it("should accept valid publish data", () => {
      const result = PublishSchema.safeParse({
        payload: { key: "value" },
        metadata: {
          schemaVersion: "1.0",
          eventType: "TestEvent",
          topic: "test.topic",
          publisher: {
            serviceName: "FinancialScrapperService",
            instanceId: "instance-1",
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it("should accept primitive payload", () => {
      const result = PublishSchema.safeParse({
        payload: "string-payload",
        metadata: {
          schemaVersion: "1.0",
          eventType: "TestEvent",
          topic: "test.topic",
          publisher: {
            serviceName: "FinancialScrapperService",
            instanceId: "instance-1",
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject missing payload", () => {
      const result = PublishSchema.safeParse({
        metadata: {
          schemaVersion: "1.0",
          eventType: "TestEvent",
          topic: "test.topic",
          publisher: {
            serviceName: "FinancialScrapperService",
            instanceId: "instance-1",
          },
        },
      });

      expect(result.success).toBe(false);
    });
  });
});
