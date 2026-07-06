import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";

export class WsReconnectHandler {
	private _shouldReconnect = true;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};

	constructor(
		private readonly _maxAttempts: number,
		private readonly _intervalMs: number,
		private readonly _url: string,
		private readonly _onReconnect: () => void
	) {}

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._shouldReconnect = value;
	}

	get attempt(): number {
		return this._wsReconnectState.attempt;
	}

	reset(): void {
		this._wsReconnectState.attempt = 0;
	}

	/**
	 * Lightweight cancel — clears the pending reconnect timer without altering shouldReconnect.
	 */
	cancel(): void {
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
	}

	/**
	 * Full stop — marks the handler as destroyed and prevents any future reconnects.
	 */
	stop(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		this.cancel();
	}

	scheduleReconnect(connectFn?: () => void): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._wsReconnectState.attempt >= this._maxAttempts) {
			logger.warn("WebSocket max reconnect attempts reached", {
				url: this._url,
				attempts: this._wsReconnectState.attempt,
			});
			return;
		}
		scheduleWsReconnect({
			state: this._wsReconnectState,
			config: {
				baseDelayMs: this._intervalMs,
				maxDelayMs: this._intervalMs,
				jitterMs: 0,
			},
			onReconnect: connectFn ?? (() => this._onReconnect()),
			logger,
		});
	}

	/** @deprecated Use {@link scheduleReconnect} instead */
	schedule(connectFn?: () => void): void {
		return this.scheduleReconnect(connectFn);
	}

	/** @deprecated Use {@link cancel} instead */
	cancelTimer(): void {
		this.cancel();
	}

	/** @deprecated Use {@link stop} instead */
	destroy(): void {
		this.stop();
	}

	/** @deprecated Use {@link reset} instead */
	resetAttempt(): void {
		this.reset();
	}
}
