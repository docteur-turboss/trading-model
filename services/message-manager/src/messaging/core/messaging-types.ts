import type { Message } from "@trading-model/common/contracts/message.types";
import type {
	InstanceId,
	MessageId,
	Topic,
	UnixTimestamp,
	URLString,
} from "@trading-model/common/domain/primitives";

export interface TopicSubscription {
	topic: Topic;
	instanceId: InstanceId;
}

export interface StreamGroupRef {
	topic: Topic;
	groupName: string;
}

export interface AckRef extends StreamGroupRef {
	messageId: MessageId;
}

export interface MessageQuery {
	topic: Topic;
	afterTimestamp: UnixTimestamp;
	limit?: number;
}

/** Params for claiming pending messages from a consumer group. */
export interface ClaimParams {
	groupName: string;
	consumerId: string;
	minIdleMs?: number;
	count?: number;
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
