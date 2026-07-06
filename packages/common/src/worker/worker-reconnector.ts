import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";

export interface WorkerReconnectorConfig {
	reconnectBaseDelayMs: number;
	reconnectMaxDelayMs: number;
}

export class WorkerReconnector {
	private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private _reconnectAttempt = 0;
	private _intentionalClose = false;
	private readonly _cfg: WorkerReconnectorConfig;
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
		this._cfg = config;
		this._onReconnect = onReconnect;
		this._emitReconnecting = emitReconnecting;
	}

	get intentionalClose(): boolean {
		return this._intentionalClose;
	}

	get reconnectAttempt(): number {
		return this._reconnectAttempt;
	}

	reset(): void {
		this._intentionalClose = false;
		this._reconnectAttempt = 0;
	}

	cancel(): void {
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
	}

	markIntentionalClose(): void {
		this._intentionalClose = true;
	}

	scheduleReconnect(): void {
		const delay = this._computeReconnectDelay();
		this._reconnectAttempt++;
		this._emitReconnecting({ attempt: this._reconnectAttempt, delay });
		this._reconnectTimer = setTimeout(() => this._doReconnect(), delay);
	}

	private _computeReconnectDelay(): number {
		return Math.min(
			this._cfg.reconnectBaseDelayMs * 2 ** this._reconnectAttempt,
			this._cfg.reconnectMaxDelayMs,
		);
	}

	private _doReconnect(): void {
		this._onReconnect().catch((err) =>
			logger.warn("Failed to reconnect worker client", {
				context: {
					attempt: this._reconnectAttempt,
					err: normalizeError(err),
				},
			}),
		);
	}
}
