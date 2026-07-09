import type { MessageId, Topic, UnixTimestamp } from "../domain/primitives";

export interface DlqEntry {
	id?: MessageId;
	topic?: Topic;
	message: unknown;
	reason?: string;
	deliveryAttempt: number;
	timestamp: UnixTimestamp;
	messageId?: MessageId;
}
