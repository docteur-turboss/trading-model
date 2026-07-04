import { describe, expect, it } from "@jest/globals";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	PUBLISH_METADATA_SCHEMA,
	PUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "../../../../../src/messaging/transport/validation/broker.schema";

describe("Broker Schemas", () => {
	describe("SUBSCRIBE_SCHEMA", () => {
		it("should accept valid subscription data", () => {
			const result = SUBSCRIBE_SCHEMA.safeParse({
				topic: "test.topic",
				callbackPath: "message/callback",
				consumerIdentity: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
			});

			expect(result.success).toBe(true);
		});

		it("should reject empty topic", () => {
			const result = SUBSCRIBE_SCHEMA.safeParse({
				topic: "",
				callbackPath: "message/callback",
				consumerIdentity: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
			});

			expect(result.success).toBe(false);
		});

		it("should reject missing callbackPath", () => {
			const result = SUBSCRIBE_SCHEMA.safeParse({
				topic: "test.topic",
				consumerIdentity: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid serviceName", () => {
			const result = SUBSCRIBE_SCHEMA.safeParse({
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

	describe("UNSUBSCRIBE_SCHEMA", () => {
		it("should accept valid unsubscribe data", () => {
			const result = UNSUBSCRIBE_SCHEMA.safeParse({
				topic: "test.topic",
				instanceId: "instance-1",
			});

			expect(result.success).toBe(true);
		});

		it("should reject empty instanceId", () => {
			const result = UNSUBSCRIBE_SCHEMA.safeParse({
				topic: "test.topic",
				instanceId: "",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("PUBLISH_METADATA_SCHEMA", () => {
		it("should accept valid metadata", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				schemaVersion: "1.0",
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
			});

			expect(result.success).toBe(true);
		});

		it("should accept metadata with all optional fields", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				correlationId: "corr-123",
				schemaVersion: "1.0",
				causationId: "caus-456",
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
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
					authContext: {
						subject: "test-subject",
						roles: ["admin", "user"],
						tenantId: "tenant-1",
					},
					signature: "sig-abc",
				},
			});

			expect(result.success).toBe(true);
		});

		it("should reject authContext with invalid shape", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				schemaVersion: "1.0",
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
				security: {
					authContext: { user: "test" },
				},
			});

			expect(result.success).toBe(false);
		});

		it("should reject missing schemaVersion", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid delivery mode", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				schemaVersion: "1.0",
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
					instanceId: "instance-1",
				},
				delivery: {
					mode: "INVALID_MODE",
				},
			});

			expect(result.success).toBe(false);
		});

		it("should reject negative TTL", () => {
			const result = PUBLISH_METADATA_SCHEMA.safeParse({
				schemaVersion: "1.0",
				eventType: "TestEvent",
				topic: "test.topic",
				publisher: {
					serviceName: ServiceInstanceName.FinancialScraperService,
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

	describe("PUBLISH_SCHEMA", () => {
		it("should accept valid publish data", () => {
			const result = PUBLISH_SCHEMA.safeParse({
				payload: { key: "value" },
				metadata: {
					schemaVersion: "1.0",
					eventType: "TestEvent",
					topic: "test.topic",
					publisher: {
						serviceName: ServiceInstanceName.FinancialScraperService,
						instanceId: "instance-1",
					},
				},
			});

			expect(result.success).toBe(true);
		});

		it("should accept primitive payload", () => {
			const result = PUBLISH_SCHEMA.safeParse({
				payload: "string-payload",
				metadata: {
					schemaVersion: "1.0",
					eventType: "TestEvent",
					topic: "test.topic",
					publisher: {
						serviceName: ServiceInstanceName.FinancialScraperService,
						instanceId: "instance-1",
					},
				},
			});

			expect(result.success).toBe(true);
		});

		it("should reject missing payload", () => {
			const result = PUBLISH_SCHEMA.safeParse({
				metadata: {
					schemaVersion: "1.0",
					eventType: "TestEvent",
					topic: "test.topic",
					publisher: {
						serviceName: ServiceInstanceName.FinancialScraperService,
						instanceId: "instance-1",
					},
				},
			});

			expect(result.success).toBe(false);
		});
	});
});
