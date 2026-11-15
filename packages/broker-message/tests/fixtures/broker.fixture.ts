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
	type Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export const createMockMessage = <T = unknown>(
	payload: T,
	overrides?: Partial<MessageMetadata>
): Message<T> => ({
	metadata: {
		messageId: "msg-123" as MessageId,
		emittedAt: UnixTimestamp.add(UnixTimestamp.now(), 86400000),
		schemaVersion: "1.0.0",
		eventType: "market.candlestick.series.fetch",
		topic: "test.topic" as Topic,
		publisher: {
			serviceName: ServiceId.of("financial-scraper"),
			instanceId: InstanceId.of("instance-1"),
		},
		delivery: { mode: DeliveryMode.AtLeastOnce, ttl: 60000 as DurationMs },
		...overrides,
	},
	payload,
});
