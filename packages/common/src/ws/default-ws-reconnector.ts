import { logger } from "../config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectConfig,
} from "../utils/ws-reconnect";
import { ReconnectStateManager } from "../worker/reconnect-state-manager";
import type { IWsReconnector } from "./i-ws-reconnector";

export interface DefaultWsReconnectorOptions {
	config?: WsReconnectConfig;
	maxAttempts?: number;
	onReconnect: () => void;
	onSchedule?: (info: { attempt: number; delay: number }) => void;
	onPermanentFallback?: () => void;
}

export class DefaultWsReconnector implements IWsReconnector {
	private readonly _stateManager = new ReconnectStateManager();
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
			baseDelayMs: options.config?.baseDelayMs ?? 1000,
			maxDelayMs: options.config?.maxDelayMs ?? 60000,
			jitterMs: options.config?.jitterMs ?? 500,
		};
		this._maxAttempts = options.maxAttempts;
		this._onReconnect = options.onReconnect;
		this._onSchedule = options.onSchedule;
		this._onPermanentFallback = options.onPermanentFallback;
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

	get permanentlyFellBack(): boolean {
		return this._permanentlyFellBack;
	}

	get isDestroyed(): boolean {
		return this._stateManager.state.destroyed;
	}

	reset(): void {
		this._stateManager.reset();
	}

	cancel(): void {
		this._stateManager.cancel();
	}

	stop(): void {
		this._stateManager.stop();
	}

	markIntentionalClose(): void {
		this._stateManager.markIntentionalClose();
	}

	scheduleReconnect(connectFn?: () => void): void {
		if (!this._stateManager.shouldReconnect) {
			return;
		}
		if (
			this._maxAttempts !== undefined &&
			this._stateManager.attempt >= this._maxAttempts
		) {
			this._permanentlyFellBack = true;
			this._onPermanentFallback?.();
			return;
		}
		scheduleWsReconnect({
			state: this._stateManager.state,
			config: this._config,
			onReconnect: connectFn ?? this._onReconnect,
			onSchedule: this._onSchedule,
			logger,
		});
	}
}
