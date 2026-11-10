import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/contracts/message-types";
import type {
	DurationMs,
	MessageId,
	Topic,
} from "@trading-model/primitives/primitives";

export const mockServiceIdentity = {
	serviceName: "financial-scraper" as const,
	instanceId: "instance-1",
};

export const mockSubscriberIdentity = {
	serviceName: "trader-trainer" as const,
	instanceId: "subscriber-1",
};

const createMockMessageMetadata = (
	overrides?: Partial<MessageMetadata>
): MessageMetadata => ({
	messageId: "msg-123" as MessageId,
	emittedAt: new Date(Date.now() + 86400000),
	schemaVersion: "1.0",
	eventType: "TestEvent",
	topic: "test.topic" as Topic,
	publisher: mockServiceIdentity,
	delivery: {
		mode: DeliveryMode.AT_LEAST_ONCE,
		ttl: 60000 as DurationMs,
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
	serviceIdentity: mockSubscriberIdentity,
};
