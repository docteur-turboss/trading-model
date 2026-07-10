import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { toTopic, type Topic } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";

export type WssMessageHandler = (
	topic: Topic,
	payload: unknown,
	metadata: MessageMetadata
) => void;

export class WssMessageDispatcher {
	private _messageHandler: WssMessageHandler;
	private readonly _handlers: Record<
		string,
		(msg: Record<string, unknown>) => void
	>;

	constructor(messageHandler?: WssMessageHandler) {
		this._messageHandler = messageHandler ?? (() => {});
		this._handlers = this._buildHandlers();
	}

	setMessageHandler(handler: WssMessageHandler): void {
		this._messageHandler = handler;
	}

	get messageHandler(): WssMessageHandler {
		return this._messageHandler;
	}

	private _onMessage(msg: Record<string, unknown>): void {
		if (!msg.topic) {
			return;
		}
		const message = msg.message as
			| { payload?: unknown; metadata?: MessageMetadata }
			| undefined;
		this._messageHandler(
			toTopic(msg.topic as string),
			message?.payload,
			message?.metadata as MessageMetadata
		);
	}

	private _onConnected(msg: Record<string, unknown>): void {
		logger.info("WSS handshake complete", { brokerInstance: msg.instanceId });
	}

	private _onSubscribed(msg: Record<string, unknown>): void {
		logger.info("WSS topics subscribed", { topics: msg.topics });
	}

	private _onError(msg: Record<string, unknown>): void {
		logger.warn("WSS server error", { message: msg.message });
	}

	private _buildHandlers(): Record<
		string,
		(msg: Record<string, unknown>) => void
	> {
		return {
			message: (msg) => this._onMessage(msg),
			connected: (msg) => this._onConnected(msg),
			subscribed: (msg) => this._onSubscribed(msg),
			error: (msg) => this._onError(msg),
		};
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
		const msg = raw as Record<string, unknown>;
		const handler = this._handlers[msg.type as string];
		if (handler) {
			handler(msg);
		}
	}
}
