import type {
	MessageId,
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

export interface DlqEntry {
	id?: MessageId;
	topic?: Topic;
	message: unknown;
	reason?: string;
	deliveryAttempt: PositiveInt;
	timestamp: UnixTimestamp;
	messageId?: MessageId;
}
