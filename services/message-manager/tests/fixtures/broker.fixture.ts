import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type {
	Message,
	MessageMetadata,
} from "../../src/messaging/core/message";

export const mockServiceIdentity = {
	serviceName: "FinancialScraperService" as const,
	instanceId: "instance-1",
};

export const mockSubscriberIdentity = {
	serviceName: "TraderTrainingService" as const,
	instanceId: "subscriber-1",
};

export const createMockMessageMetadata = (
	overrides?: Partial<MessageMetadata>
): MessageMetadata => ({
	messageId: "msg-123",
	emittedAt: new Date(Date.now() + 86400000),
	schemaVersion: "1.0",
	eventType: "TestEvent",
	topic: "test.topic",
	publisher: mockServiceIdentity,
	delivery: {
		mode: DeliveryMode.AT_LEAST_ONCE,
		ttl: 60000,
	},
	...overrides,
});

export const createMockMessage = <T = unknown>(
	payload: T,
	overrides?: Partial<MessageMetadata>
): Message<T> => ({
	metadata: createMockMessageMetadata(overrides),
	payload,
});

export const mockSubscribeParams = {
	topic: "test.topic",
	callbackPath: "message/callback",
	consumerIdentity: mockSubscriberIdentity,
};

export const mockUnsubscribeParams = {
	topic: "test.topic",
	instanceId: mockSubscriberIdentity.instanceId,
};

export const mockPublishPayload = { key: "value", number: 42 };

export const mockPublishMetadata = {
	schemaVersion: "1.0",
	eventType: "TestEvent",
	topic: "test.topic",
	publisher: mockServiceIdentity,
};

export const mockAddress = {
	ip: "10.0.0.1",
	port: 8444,
};
