import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import {
	scheduleWsReconnect,
	type WsReconnectConfig,
} from "../utils/ws-reconnect";
import type { IWsReconnector } from "../ws/i-ws-reconnector";
import { ReconnectStateManager } from "./reconnect-state-manager";

export interface WorkerReconnectorConfig {
	reconnectBaseDelayMs: number;
	reconnectMaxDelayMs: number;
}

export class WorkerReconnector implements IWsReconnector {
	private readonly _stateManager = new ReconnectStateManager();
	private readonly _config: WsReconnectConfig;
	private readonly _onReconnect: () => Promise<void>;
	private readonly _emitReconnecting: (info: {
		attempt: number;
		delay: number;
	}) => void;

	constructor(
		config: WorkerReconnectorConfig,
		onReconnect: () => Promise<void>,
		emitReconnecting: (info: { attempt: number; delay: number }) => void
	) {
		this._config = {
			baseDelayMs: config.reconnectBaseDelayMs,
			maxDelayMs: config.reconnectMaxDelayMs,
			jitterMs: 0,
		};
		this._onReconnect = onReconnect;
		this._emitReconnecting = emitReconnecting;
	}

	get shouldReconnect(): boolean {
		return this._stateManager.shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._stateManager.shouldReconnect = value;
	}

	get intentionalClose(): boolean {
		return this._stateManager.intentionalClose;
	}

	get reconnectAttempt(): number {
		return this._stateManager.reconnectAttempt;
	}

	get attempt(): number {
		return this._stateManager.attempt;
	}

	reset(): void {
		this._stateManager.reset();
	}

	/**
	 * Lightweight cancel — clears the pending reconnect timer without altering shouldReconnect.
	 */
	cancel(): void {
		this._stateManager.cancel();
	}

	/**
	 * Full stop — marks as destroyed and prevents any future reconnects.
	 */
	stop(): void {
		this._stateManager.stop();
	}

	markIntentionalClose(): void {
		this._stateManager.markIntentionalClose();
	}

	scheduleReconnect(): void {
		scheduleWsReconnect({
			state: this._stateManager.state,
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
					attempt: this._stateManager.attempt,
					err: normalizeError(err),
				},
			})
		);
	}
}
