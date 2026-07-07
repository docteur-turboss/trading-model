import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import type { IWsReconnector } from "@trading-model/common/ws/i-ws-reconnector";

export class CertWsReconnectHandler implements IWsReconnector {
	private _destroyed = false;
	readonly reconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};

	get isDestroyed(): boolean {
		return this._destroyed;
	}

	get shouldReconnect(): boolean {
		return !this._destroyed;
	}

	get attempt(): number {
		return this.reconnectState.attempt;
	}

	scheduleReconnect(onReconnect: () => void): void {
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

	cancel(): void {
		if (this.reconnectState.timer) {
			clearTimeout(this.reconnectState.timer);
			this.reconnectState.timer = null;
		}
	}

	stop(): void {
		this._destroyed = true;
		this.reconnectState.destroyed = true;
		this.cancel();
	}

	reset(): void {
		this.reconnectState.attempt = 0;
	}
}
