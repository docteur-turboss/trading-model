export interface INcomingWssMessage {
	type: string;
	instanceId?: string;
	topics?: string[];
	payload?: unknown;
	metadata?: unknown;
	traceparent?: string;
	messageId?: string;
}
