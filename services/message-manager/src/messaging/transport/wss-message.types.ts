import type {
	InstanceId,
	MessageId,
	Topic,
} from "@trading-model/common/domain/primitives";

export enum TransportMessageType {
	Subscribe = "subscribe",
	Unsubscribe = "unsubscribe",
	Publish = "publish",
	Ack = "ack",
	Nack = "nack",
}

export interface WsTransportMessage {
	type: TransportMessageType;
	instanceId?: InstanceId;
	topics?: Topic[];
	payload?: unknown;
	metadata?: unknown;
	traceparent?: string;
	messageId?: MessageId;
}
