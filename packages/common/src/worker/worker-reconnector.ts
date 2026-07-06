import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import {
	type WsReconnectConfig,
	type WsReconnectState,
	scheduleWsReconnect,
} from "../utils/ws-reconnect";

export interface WorkerReconnectorConfig {
	reconnectBaseDelayMs: number;
	reconnectMaxDelayMs: number;
}

export class WorkerReconnector {
	private readonly _state: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _intentionalClose = false;
	private readonly _config: WsReconnectConfig;
	private readonly _onReconnect: () => Promise<void>;
	private readonly _emitReconnecting: (info: {
		attempt: number;
		delay: number;
	}) => void;

	constructor(
		config: WorkerReconnectorConfig,
		onReconnect: () => Promise<void>,
		emitReconnecting: (info: { attempt: number; delay: number }) => void,
	) {
		this._config = {
			baseDelayMs: config.reconnectBaseDelayMs,
			maxDelayMs: config.reconnectMaxDelayMs,
			jitterMs: 0,
		};
		this._onReconnect = onReconnect;
		this._emitReconnecting = emitReconnecting;
	}

	get intentionalClose(): boolean {
		return this._intentionalClose;
	}

	get reconnectAttempt(): number {
		return this._state.attempt;
	}

	reset(): void {
		this._intentionalClose = false;
		this._state.attempt = 0;
	}

	cancel(): void {
		if (this._state.timer) {
			clearTimeout(this._state.timer);
			this._state.timer = null;
		}
	}

	markIntentionalClose(): void {
		this._intentionalClose = true;
	}

	scheduleReconnect(): void {
		scheduleWsReconnect({
			state: this._state,
			config: this._config,
			onReconnect: () => {
				this._doReconnect();
			},
			onSchedule: (info) => {
				this._emitReconnecting(info);
			},
			logger: {
				info: (_msg, _context) => {
					/* WorkerReconnector uses emitReconnecting instead */
				},
				warn: (msg, context) => {
					logger.warn(msg, context);
				},
			},
		});
	}

	private _doReconnect(): void {
		this._onReconnect().catch((err) =>
			logger.warn("Failed to reconnect worker client", {
				context: {
					attempt: this._state.attempt,
					err: normalizeError(err),
				},
			}),
		);
	}
}
