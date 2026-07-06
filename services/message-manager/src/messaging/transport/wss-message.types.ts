import type {
	InstanceId,
	MessageId,
	Topic,
} from "@trading-model/common/domain/primitives";

export type WssMessageType =
	| "subscribe"
	| "unsubscribe"
	| "publish"
	| "ack"
	| "nack";

export interface IncomingWssMessage {
	type: WssMessageType;
	instanceId?: InstanceId;
	topics?: Topic[];
	payload?: unknown;
	metadata?: unknown;
	traceparent?: string;
	messageId?: MessageId;
}
