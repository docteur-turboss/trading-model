import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { type Topic, toTopic } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";

export type WssMessageHandler = (
	topic: Topic,
	payload: unknown,
	metadata: MessageMetadata
) => void;

export enum WssServerEventType {
	Message = "message",
	Connected = "connected",
	Subscribed = "subscribed",
	Error = "error",
}

interface WssMessageEvent {
	type: WssServerEventType.Message;
	topic: string;
	message: { payload?: unknown; metadata?: MessageMetadata };
}

interface WssConnectedEvent {
	type: WssServerEventType.Connected;
	instanceId: string;
}

interface WssSubscribedEvent {
	type: WssServerEventType.Subscribed;
	topics: string[];
}

interface WssErrorEvent {
	type: WssServerEventType.Error;
	message: string;
}

type WssServerEvent =
	| WssMessageEvent
	| WssConnectedEvent
	| WssSubscribedEvent
	| WssErrorEvent;

export class WssMessageDispatcher {
	private _messageHandler: WssMessageHandler;

	constructor(messageHandler?: WssMessageHandler) {
		this._messageHandler = messageHandler ?? (() => {});
	}

	setMessageHandler(handler: WssMessageHandler): void {
		this._messageHandler = handler;
	}

	get messageHandler(): WssMessageHandler {
		return this._messageHandler;
	}

	private _onMessage(msg: WssMessageEvent): void {
		this._messageHandler(
			toTopic(msg.topic),
			msg.message.payload,
			msg.message.metadata as MessageMetadata
		);
	}

	private _onConnected(msg: WssConnectedEvent): void {
		logger.info("WSS handshake complete", { brokerInstance: msg.instanceId });
	}

	private _onSubscribed(msg: WssSubscribedEvent): void {
		logger.info("WSS topics subscribed", { topics: msg.topics });
	}

	private _onError(msg: WssErrorEvent): void {
		logger.warn("WSS server error", { message: msg.message });
	}

	dispatch(raw: string): void {
		try {
			const msg = JSON.parse(raw);
			this._dispatchMessage(msg);
		} catch (err) {
			logger.warn("WSS message parse error", {
				error: normalizeError(err as Error),
			});
		}
	}

	private _dispatchMessage(raw: unknown): void {
		const msg = raw as WssServerEvent;
		switch (msg.type) {
			case WssServerEventType.Message:
				this._onMessage(msg);
				break;
			case WssServerEventType.Connected:
				this._onConnected(msg);
				break;
			case WssServerEventType.Subscribed:
				this._onSubscribed(msg);
				break;
			case WssServerEventType.Error:
				this._onError(msg);
				break;
			default:
				break;
		}
	}
}
