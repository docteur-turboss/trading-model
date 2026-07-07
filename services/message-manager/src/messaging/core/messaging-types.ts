export interface TopicSubscription {
	topic: string;
	instanceId: string;
}

export interface StreamGroupRef {
	topic: string;
	groupName: string;
}

export interface AckRef extends StreamGroupRef {
	messageId: string;
}

export interface MessageQuery {
	topic: string;
	afterTimestamp: number;
	limit?: number;
}
