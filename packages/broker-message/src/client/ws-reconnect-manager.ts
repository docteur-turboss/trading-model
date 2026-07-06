import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import type { IWsReconnector } from "@trading-model/common/ws/i-ws-reconnector";
import { ReconnectFallbackHandler } from "./reconnect-fallback-handler";

const WSS_RECONNECT_BASE_MS = 1000;
const WSS_RECONNECT_MAX_MS = 30000;
const WSS_MAX_RECONNECT_ATTEMPTS = 20;

type ConnectFn = () => void;

export class WsReconnectManager implements IWsReconnector {
	private _shouldReconnect = true;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private readonly _fallbackHandler = new ReconnectFallbackHandler();

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._shouldReconnect = value;
	}

	get permanentlyFellBack(): boolean {
		return this._fallbackHandler.permanentlyFellBack;
	}

	get attempt(): number {
		return this._wsReconnectState.attempt;
	}

	get reconnectState(): WsReconnectState {
		return this._wsReconnectState;
	}

	scheduleReconnect(
		connectFn: ConnectFn,
		onPermanentFallback?: () => void
	): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._wsReconnectState.attempt >= WSS_MAX_RECONNECT_ATTEMPTS) {
			this._fallbackHandler.handleMaxAttemptsReached(
				connectFn,
				onPermanentFallback
			);
			return;
		}
		scheduleWsReconnect({
			state: this._wsReconnectState,
			config: {
				baseDelayMs: WSS_RECONNECT_BASE_MS,
				maxDelayMs: WSS_RECONNECT_MAX_MS,
				jitterMs: 1000,
			},
			onReconnect: connectFn,
			logger,
		});
	}

	cancel(): void {
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
	}

	stop(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		this.cancel();
		this._fallbackHandler.stop();
	}

	reset(): void {
		this._fallbackHandler.reset();
		this._wsReconnectState.attempt = 0;
	}
}
