import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type {
	InstanceId,
	MessageId,
} from "@trading-model/common/domain/primitives";
import type { MessageMetadata, ServiceIdentity } from "./message.types";

export enum WsClientMessageType {
	Subscribe = "subscribe",
	Unsubscribe = "unsubscribe",
	PublishAsync = "publish_async",
	PublishDirect = "publish_direct",
}

export enum WsServerMessageType {
	Ack = "ack",
	Deliver = "deliver",
	Error = "error",
}

export interface WsClientSubscribePayload {
	topics: EventEnumMap[];
	identity: ServiceIdentity;
	callbackPath: string;
}

export interface WsClientUnsubscribePayload {
	topics: EventEnumMap[];
	instanceId: InstanceId;
}

export interface WsClientPublishPayload {
	target?: string;
	payload: unknown;
	metadata: MessageMetadata;
}

export interface WsClientMessage {
	type: WsClientMessageType;
	messageId: MessageId;
	payload:
		| WsClientSubscribePayload
		| WsClientUnsubscribePayload
		| WsClientPublishPayload;
}

export enum AckStatus {
	Ok = "ok",
	Error = "error",
}

export interface WsServerAckPayload {
	status: AckStatus;
	error?: string;
}

export interface WsServerDeliverPayload {
	metadata: MessageMetadata;
	payload: unknown;
}

import type { ErrorResponse } from "./error-response";

export type WsServerErrorPayload = ErrorResponse;

export type WsServerPayload =
	| WsServerAckPayload
	| WsServerDeliverPayload
	| WsServerErrorPayload;

export interface WsServerMessage {
	type: WsServerMessageType;
	messageId?: MessageId;
	payload: WsServerPayload;
}
