import { IdentifyType, MessageMetadata } from './message.types';
import { EventEnumMap } from '../config/event.types';

export type WsClientMessageType = 'subscribe' | 'unsubscribe' | 'publish_async' | 'publish_direct';

export type WsServerMessageType = 'ack' | 'deliver' | 'error';

export interface WsClientSubscribePayload {
  topics: EventEnumMap[];
  identity: IdentifyType;
  callbackPath: string;
}

export interface WsClientUnsubscribePayload {
  topics: EventEnumMap[];
  instanceId: string;
}

export interface WsClientPublishPayload {
  target?: string;
  payload: unknown;
  metadata: MessageMetadata;
}

export interface WsClientMessage {
  type: WsClientMessageType;
  messageId: string;
  payload: WsClientSubscribePayload | WsClientUnsubscribePayload | WsClientPublishPayload;
}

export interface WsServerAckPayload {
  status: 'ok' | 'error';
  error?: string;
}

export interface WsServerDeliverPayload {
  metadata: MessageMetadata;
  payload: unknown;
}

export interface WsServerErrorPayload {
  code: string;
  message: string;
}

export type WsServerPayload = WsServerAckPayload | WsServerDeliverPayload | WsServerErrorPayload;

export interface WsServerMessage {
  type: WsServerMessageType;
  messageId?: string;
  payload: WsServerPayload;
}
