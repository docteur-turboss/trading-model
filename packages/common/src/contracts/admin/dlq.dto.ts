import type { MessageId, Topic } from "../../domain/primitives";

export interface DlqMessage {
	id: MessageId;
	timestamp: string;
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
	lastIncident: string;
}
