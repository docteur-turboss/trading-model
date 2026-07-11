import type {
	MessageId,
	Percentage,
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "../../domain/primitives";

export interface DlqMessage {
	id: MessageId;
	timestamp: UnixTimestamp;
	topic: Topic;
	messageId: MessageId;
	failureReason: string;
	attempts: PositiveInt;
	payloadPreview: string;
}

export interface DlqStats {
	pending: PositiveInt;
	retryRate: Percentage;
	totalSize: PositiveInt;
	lastIncident: UnixTimestamp;
}
