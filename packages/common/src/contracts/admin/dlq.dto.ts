import type { MessageId, Topic, UnixTimestamp } from "../../domain/primitives";

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
	retryRate: number;
	totalSize: number;
	lastIncident: UnixTimestamp;
}
