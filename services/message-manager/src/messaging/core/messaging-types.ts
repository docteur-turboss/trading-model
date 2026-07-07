import type {
	InstanceId,
	MessageId,
	Topic,
	UnixTimestamp,
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
