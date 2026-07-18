import { logger } from "../config/logger";
import { DurationMs } from "../domain/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "../utils/backoff-config";
import type { IWsReconnector } from "./i-ws-reconnector";

export interface WsReconnectConfig extends BackoffConfig {
	maxAttempts?: number;
}

export interface DefaultWsReconnectorOptions {
	config?: WsReconnectConfig;
	maxAttempts?: number;
	onReconnect: () => void;
	onSchedule?: (info: { attempt: number; delay: number }) => void;
	onPermanentFallback?: () => void;
}

export class DefaultWsReconnector implements IWsReconnector {
	private _state: {
		attempt: number;
		timer: ReturnType<typeof setTimeout> | null;
		destroyed: boolean;
	} = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _shouldReconnect = true;
	private _intentionalClose = false;
	private readonly _config: WsReconnectConfig;
	private readonly _maxAttempts?: number;
	private readonly _onReconnect: () => void;
	private readonly _onSchedule?: (info: {
		attempt: number;
		delay: number;
	}) => void;
	private readonly _onPermanentFallback?: () => void;
	private _permanentlyFellBack = false;

	constructor(options: DefaultWsReconnectorOptions) {
		this._config = {
			baseDelayMs: options.config?.baseDelayMs ?? DurationMs.of(1000),
			maxDelayMs: options.config?.maxDelayMs ?? DurationMs.of(60000),
			jitterMs: options.config?.jitterMs ?? DurationMs.of(500),
		};
		this._maxAttempts = options.maxAttempts;
		this._onReconnect = options.onReconnect;
		this._onSchedule = options.onSchedule;
		this._onPermanentFallback = options.onPermanentFallback;
	}

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._shouldReconnect = value;
	}

	get intentionalClose(): boolean {
		return this._intentionalClose;
	}

	get reconnectAttempt(): number {
		return this._state.attempt;
	}

	get attempt(): number {
		return this._state.attempt;
	}

	get permanentlyFellBack(): boolean {
		return this._permanentlyFellBack;
	}

	get isDestroyed(): boolean {
		return this._state.destroyed;
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

	stop(): void {
		this._shouldReconnect = false;
		this._state.destroyed = true;
		this.cancel();
	}

	markIntentionalClose(): void {
		this._intentionalClose = true;
	}

	private _calculateDelay(
		config: WsReconnectConfig,
		attempt: number
	): DurationMs {
		return computeExponentialBackoffWithJitter(attempt, {
			baseDelayMs: config.baseDelayMs ?? DurationMs.of(1000),
			maxDelayMs: config.maxDelayMs ?? DurationMs.of(60000),
			jitterMs: config.jitterMs ?? DurationMs.of(500),
		});
	}

	scheduleReconnect(connectFn?: () => void): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._state.destroyed) {
			return;
		}
		if (
			this._maxAttempts !== undefined &&
			this._state.attempt >= this._maxAttempts
		) {
			logger.warn("WebSocket max reconnect attempts reached", {
				context: { attempts: this._state.attempt },
			});
			this._permanentlyFellBack = true;
			this._onPermanentFallback?.();
			return;
		}
		if (this._state.timer) {
			clearTimeout(this._state.timer);
			this._state.timer = null;
		}
		this._state.attempt++;
		const delay = this._calculateDelay(this._config, this._state.attempt);
		this._onSchedule?.({ attempt: this._state.attempt, delay });
		logger.info(
			`WebSocket reconnecting in ${Math.round(delay)}ms (attempt ${this._state.attempt})`
		);
		this._state.timer = setTimeout(() => {
			this._state.timer = null;
			(connectFn ?? this._onReconnect)();
		}, delay);
		this._state.timer.unref();
	}
}
