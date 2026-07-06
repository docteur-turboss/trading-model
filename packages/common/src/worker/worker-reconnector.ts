import { logger } from "../config/logger";
import { computeExponentialBackoff } from "../utils/backoff-config";
import { normalizeError } from "../utils/errors";

export interface WorkerReconnectorConfig {
	reconnectBaseDelayMs: number;
	reconnectMaxDelayMs: number;
}

export class WorkerReconnector {
	private _attempt = 0;
	private _timer: ReturnType<typeof setTimeout> | null = null;
	private _intentionalClose = false;
	private readonly _baseDelayMs: number;
	private readonly _maxDelayMs: number;
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
		this._baseDelayMs = config.reconnectBaseDelayMs;
		this._maxDelayMs = config.reconnectMaxDelayMs;
		this._onReconnect = onReconnect;
		this._emitReconnecting = emitReconnecting;
	}

	get intentionalClose(): boolean {
		return this._intentionalClose;
	}

	get reconnectAttempt(): number {
		return this._attempt;
	}

	reset(): void {
		this._intentionalClose = false;
		this._attempt = 0;
	}

	cancel(): void {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
	}

	markIntentionalClose(): void {
		this._intentionalClose = true;
	}

	scheduleReconnect(): void {
		const delay = computeExponentialBackoff(
			this._attempt,
			{ baseDelayMs: this._baseDelayMs, maxDelayMs: this._maxDelayMs },
		);
		this._attempt++;
		this._emitReconnecting({ attempt: this._attempt, delay });
		this._timer = setTimeout(() => this._doReconnect(), delay);
	}

	private _doReconnect(): void {
		this._onReconnect().catch((err) =>
			logger.warn("Failed to reconnect worker client", {
				context: {
					attempt: this._attempt,
					err: normalizeError(err),
				},
			}),
		);
	}
}
