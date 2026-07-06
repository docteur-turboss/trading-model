import { logger } from "@trading-model/common/config/logger";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

const WSS_RECONNECT_POLL_INTERVAL_MS = 60_000;

type ConnectFn = () => void;

export class ReconnectFallbackHandler {
	private _permanentlyFellBack = false;
	private readonly _reconnectPollTimer = new TimerHandle();

	get permanentlyFellBack(): boolean {
		return this._permanentlyFellBack;
	}

	handleMaxAttemptsReached(
		connectFn: ConnectFn,
		onPermanentFallback?: () => void
	): void {
		if (this._permanentlyFellBack) {
			return;
		}
		this._permanentlyFellBack = true;
		logger.warn(
			"WSS max reconnect attempts reached, falling back to HTTP — will periodically retry WSS"
		);
		onPermanentFallback?.();
		this._startReconnectPolling(connectFn);
	}

	private _startReconnectPolling(connectFn: ConnectFn): void {
		if (this._reconnectPollTimer.isRunning) {
			return;
		}
		this._reconnectPollTimer.startInterval(
			() => this._pollReconnect(connectFn),
			WSS_RECONNECT_POLL_INTERVAL_MS
		);
		this._reconnectPollTimer.unref();
	}

	private _pollReconnect(connectFn: ConnectFn): void {
		if (!this._permanentlyFellBack) {
			this._stopReconnectPolling();
			return;
		}
		logger.info(
			"WSS reconnect poll — attempting to re-establish WebSocket connection"
		);
		this._permanentlyFellBack = false;
		connectFn();
	}

	private _stopReconnectPolling(): void {
		this._reconnectPollTimer.stop();
	}

	reset(): void {
		this._permanentlyFellBack = false;
	}

	stop(): void {
		this._stopReconnectPolling();
	}
}
