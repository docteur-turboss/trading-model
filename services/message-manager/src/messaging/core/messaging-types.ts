import type {
	ConsumerGroupName,
	ConsumerId,
	DurationMs,
	InstanceId,
	Limit,
	MessageId,
	PositiveInt,
	Topic,
	UnixTimestamp,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/contracts/message.types";

export interface TopicSubscription {
	topic: Topic;
	instanceId: InstanceId;
}

export interface StreamGroupRef {
	topic: Topic;
	groupName: ConsumerGroupName;
}

export interface AckRef extends StreamGroupRef {
	messageId: MessageId;
}

export interface MessageQuery {
	topic: Topic;
	afterTimestamp: UnixTimestamp;
	limit?: Limit;
}

/** Params for claiming pending messages from a consumer group. */
export interface ClaimParams {
	groupName: ConsumerGroupName;
	consumerId: ConsumerId;
	minIdleMs?: DurationMs;
	count?: PositiveInt;
}

/** Data stored for a pending ACK entry. */
export interface PendingAckData {
	topic: Topic;
	subscriberUrl: URLString;
	message: Message;
}

export interface DedupConfig {
	deduplicationId: string;
	ttlS: number;
}

export type { SubscribesTopicsPayload as SubscriptionParams } from "@trading-model/broker-message";
