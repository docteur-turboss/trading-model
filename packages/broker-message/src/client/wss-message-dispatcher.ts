import { logger } from "@trading-model/common/config/logger";
import { type Topic, toTopic } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { MessageMetadata } from "@trading-model/validation/contracts/message.types";

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

type WssEventHandler = (msg: WssServerEvent) => void;

export class WssMessageDispatcher {
	private _messageHandler: WssMessageHandler;
	private readonly _handlers: Record<string, WssEventHandler>;

	constructor(messageHandler?: WssMessageHandler) {
		this._messageHandler = messageHandler ?? (() => {});
		this._handlers = {
			[WssServerEventType.Message]: (msg) =>
				this._onMessage(msg as WssMessageEvent),
			[WssServerEventType.Connected]: (msg) =>
				this._onConnected(msg as WssConnectedEvent),
			[WssServerEventType.Subscribed]: (msg) =>
				this._onSubscribed(msg as WssSubscribedEvent),
			[WssServerEventType.Error]: (msg) => this._onError(msg as WssErrorEvent),
		};
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
		this._handlers[msg.type]?.(msg);
	}
}
