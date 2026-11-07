import type {
	MessageId,
	PositiveInt,
	Topic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export interface DlqEntry {
	id?: MessageId;
	topic?: Topic;
	message: unknown;
	reason?: string;
	deliveryAttempt: PositiveInt;
	timestamp: UnixTimestamp;
	messageId?: MessageId;
	/**
	 * Subscriber service whose delivery failed: a replay reaches only this one
	 * (ADR-0043). Absent on entries written before it existed: they are
	 * replayed to every subscriber of the topic, as before.
	 */
	service?: string;
}
