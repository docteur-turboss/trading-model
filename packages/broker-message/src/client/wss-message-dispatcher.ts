import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";

export type WssMessageHandler = (
	topic: string,
	payload: unknown,
	metadata: MessageMetadata
) => void;

export class WssMessageDispatcher {
	private _messageHandler: WssMessageHandler | null = null;
	private readonly _handlers: Record<string, (msg: Record<string, unknown>) => void>;

	constructor() {
		this._handlers = this._buildHandlers();
	}

	setMessageHandler(handler: WssMessageHandler | null): void {
		this._messageHandler = handler;
	}

	private _buildHandlers(): Record<string, (msg: Record<string, unknown>) => void> {
		return {
			message: (msg) => {
				if (!msg.topic) return;
				const message = msg.message as
					| { payload?: unknown; metadata?: MessageMetadata }
					| undefined;
				this._messageHandler?.(
					msg.topic as string,
					message?.payload,
					message?.metadata as MessageMetadata
				);
			},
			connected: (msg) => {
				logger.info("WSS handshake complete", {
					brokerInstance: msg.instanceId,
				});
			},
			subscribed: (msg) => {
				logger.info("WSS topics subscribed", { topics: msg.topics });
			},
			error: (msg) => {
				logger.warn("WSS server error", { message: msg.message });
			},
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
