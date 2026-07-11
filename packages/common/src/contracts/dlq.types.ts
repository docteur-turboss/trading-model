import type {
	MessageId,
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "../domain/primitives";

export interface DlqEntry {
	id?: MessageId;
	topic?: Topic;
	message: unknown;
	reason?: string;
	deliveryAttempt: PositiveInt;
	timestamp: UnixTimestamp;
	messageId?: MessageId;
}
