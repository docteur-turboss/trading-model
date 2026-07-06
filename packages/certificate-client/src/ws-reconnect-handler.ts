import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";

export class WsReconnectHandler {
	private _destroyed = false;
	readonly reconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};

	get isDestroyed(): boolean {
		return this._destroyed;
	}

	schedule(onReconnect: () => void): void {
		if (this._destroyed) {
			return;
		}
		scheduleWsReconnect({
			state: this.reconnectState,
			config: { baseDelayMs: 1000, maxDelayMs: 60000, jitterMs: 500 },
			onReconnect,
			logger,
		});
	}

	cancelTimer(): void {
		if (this.reconnectState.timer) {
			clearTimeout(this.reconnectState.timer);
			this.reconnectState.timer = null;
		}
	}

	destroy(): void {
		this._destroyed = true;
		this.reconnectState.destroyed = true;
		this.cancelTimer();
	}

	resetAttempt(): void {
		this.reconnectState.attempt = 0;
	}
}
