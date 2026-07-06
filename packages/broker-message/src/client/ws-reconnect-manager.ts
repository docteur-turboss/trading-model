import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import { logger } from "@trading-model/common/config/logger";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

const WSS_RECONNECT_BASE_MS = 1000;
const WSS_RECONNECT_MAX_MS = 30000;
const WSS_MAX_RECONNECT_ATTEMPTS = 20;
const WSS_RECONNECT_POLL_INTERVAL_MS = 60_000;

type ConnectFn = () => void;

export class WsReconnectManager {
	private _shouldReconnect = true;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _permanentlyFellBack = false;
	private readonly _reconnectPollTimer = new TimerHandle();

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._shouldReconnect = value;
	}

	get permanentlyFellBack(): boolean {
		return this._permanentlyFellBack;
	}

	get attempt(): number {
		return this._wsReconnectState.attempt;
	}

	get reconnectState(): WsReconnectState {
		return this._wsReconnectState;
	}

	scheduleReconnect(connectFn: ConnectFn, onPermanentFallback?: () => void): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._wsReconnectState.attempt >= WSS_MAX_RECONNECT_ATTEMPTS) {
			this._handleMaxAttemptsReached(connectFn, onPermanentFallback);
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

	/** Lightweight cancel — clears the pending reconnect timer without altering shouldReconnect. */
	cancel(): void {
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
	}

	/** Full stop — marks the handler as destroyed and prevents any future reconnects. */
	stop(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		this.cancel();
		this._stopReconnectPolling();
	}

	reset(): void {
		this._permanentlyFellBack = false;
		this._wsReconnectState.attempt = 0;
	}

	private _handleMaxAttemptsReached(connectFn: ConnectFn, onPermanentFallback?: () => void): void {
		if (this._permanentlyFellBack) {
			return;
		}
		this._permanentlyFellBack = true;
		logger.warn(
			"WSS max reconnect attempts reached, falling back to HTTP — will periodically retry WSS",
		);
		onPermanentFallback?.();
		this._startReconnectPolling(connectFn);
	}

	private _startReconnectPolling(connectFn: ConnectFn): void {
		if (this._reconnectPollTimer.isRunning) {
			return;
		}
		this._reconnectPollTimer.startInterval(() => this._pollReconnect(connectFn), WSS_RECONNECT_POLL_INTERVAL_MS);
		this._reconnectPollTimer.unref();
	}

	private _pollReconnect(connectFn: ConnectFn): void {
		if (!this._shouldReconnect) {
			this._stopReconnectPolling();
			return;
		}
		logger.info("WSS reconnect poll — attempting to re-establish WebSocket connection");
		this._wsReconnectState.attempt = 0;
		this._permanentlyFellBack = false;
		connectFn();
	}

	private _stopReconnectPolling(): void {
		this._reconnectPollTimer.stop();
	}
}
