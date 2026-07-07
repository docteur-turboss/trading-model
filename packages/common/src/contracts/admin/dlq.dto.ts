import type {
	MessageId,
	Percentage,
	Topic,
	UnixTimestamp,
} from "../../domain/primitives";

export interface DlqMessage {
	id: MessageId;
	timestamp: UnixTimestamp;
	topic: Topic;
	messageId: MessageId;
	failureReason: string;
	attempts: number;
	payloadPreview: string;
}

export interface DlqStats {
	pending: number;
	retryRate: Percentage;
	totalSize: number;
	lastIncident: UnixTimestamp;
}
