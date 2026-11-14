import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/contracts/message-types";
import {
	type DurationMs,
	InstanceId,
	type MessageId,
	ServiceId,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export const mockServiceIdentity = {
	serviceName: ServiceId.of("financial-scraper"),
	instanceId: InstanceId.of("instance-1"),
};

export const mockSubscriberIdentity = {
	serviceName: ServiceId.of("trader-trainer"),
	instanceId: InstanceId.of("subscriber-1"),
};

const createMockMessageMetadata = (
	overrides?: Partial<MessageMetadata>
): MessageMetadata => ({
	messageId: "msg-123" as MessageId,
	emittedAt: UnixTimestamp.add(UnixTimestamp.now(), 86400000),
	schemaVersion: "1.0.0",
	eventType: "example.debug.create",
	topic: "test.topic" as Topic,
	publisher: mockServiceIdentity,
	delivery: {
		mode: DeliveryMode.AtLeastOnce,
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
	topic: Topic.of("test.topic"),
	callbackPath: "message/callback",
	serviceIdentity: mockSubscriberIdentity,
};
