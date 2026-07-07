import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import { ReconnectStateManager } from "@trading-model/common/worker/reconnect-state-manager";
import type { IWsReconnector } from "@trading-model/common/ws/i-ws-reconnector";
import { ReconnectFallbackHandler } from "./reconnect-fallback-handler";

const WSS_RECONNECT_BASE_MS = 1000;
const WSS_RECONNECT_MAX_MS = 30000;
const WSS_MAX_RECONNECT_ATTEMPTS = 20;

type ConnectFn = () => void;

export class WsReconnectManager implements IWsReconnector {
	private readonly _state = new ReconnectStateManager();
	private readonly _fallbackHandler = new ReconnectFallbackHandler();
	private _onPermanentFallback?: () => void;

	get shouldReconnect(): boolean {
		return this._state.shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._state.shouldReconnect = value;
	}

	get permanentlyFellBack(): boolean {
		return this._fallbackHandler.permanentlyFellBack;
	}

	get attempt(): number {
		return this._state.attempt;
	}

	get reconnectState(): WsReconnectState {
		return this._state.state;
	}

	setOnPermanentFallback(cb: () => void): void {
		this._onPermanentFallback = cb;
	}

	scheduleReconnect(connectFn?: () => void): void {
		if (!this._state.shouldReconnect) {
			return;
		}
		if (this._state.attempt >= WSS_MAX_RECONNECT_ATTEMPTS) {
			this._fallbackHandler.handleMaxAttemptsReached(
				connectFn ?? (() => {}),
				this._onPermanentFallback
			);
			return;
		}
		scheduleWsReconnect({
			state: this._state.state,
			config: {
				baseDelayMs: WSS_RECONNECT_BASE_MS,
				maxDelayMs: WSS_RECONNECT_MAX_MS,
				jitterMs: 1000,
			},
			onReconnect: connectFn ?? (() => {}),
			logger,
		});
	}

	cancel(): void {
		this._state.cancel();
	}

	stop(): void {
		this._state.stop();
		this._fallbackHandler.stop();
	}

	reset(): void {
		this._fallbackHandler.reset();
		this._state.reset();
	}
}
