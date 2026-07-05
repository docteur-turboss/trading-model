export type WssMessageType = "subscribe" | "unsubscribe" | "publish" | "ack" | "nack";

export interface IncomingWssMessage {
	type: WssMessageType;
	instanceId?: string;
	topics?: string[];
	payload?: unknown;
	metadata?: unknown;
	traceparent?: string;
	messageId?: string;
}
