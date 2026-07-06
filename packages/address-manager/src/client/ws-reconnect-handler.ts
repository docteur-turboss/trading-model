import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import { logger } from "@trading-model/common/config/logger";

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
		private readonly _onReconnect: () => void,
	) {}

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	get attempt(): number {
		return this._wsReconnectState.attempt;
	}

	resetAttempts(): void {
		this._wsReconnectState.attempt = 0;
	}

	reset(): void {
		this.resetAttempts();
	}

	stop(): void {
		this.cancel();
	}

	schedule(): void {
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
			onReconnect: () => this._onReconnect(),
			logger,
		});
	}

	cancel(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
	}
}
