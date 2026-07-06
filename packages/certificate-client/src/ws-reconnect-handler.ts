import { logger } from "@trading-model/common/config/logger";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";

export class CertWsReconnectHandler {
	private _destroyed = false;
	readonly reconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};

	get isDestroyed(): boolean {
		return this._destroyed;
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

	/** @deprecated Use {@link scheduleReconnect} instead */
	schedule(onReconnect: () => void): void {
		this.scheduleReconnect(onReconnect);
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
