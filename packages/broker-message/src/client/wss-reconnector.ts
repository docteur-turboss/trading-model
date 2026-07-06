import type { WsReconnectState } from "@trading-model/common/utils/ws-reconnect";
import { WsReconnectManager } from "./ws-reconnect-manager";

type ConnectFn = () => void;

export class WssReconnector {
	private readonly _manager = new WsReconnectManager();

	get shouldReconnect(): boolean {
		return this._manager.shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._manager.shouldReconnect = value;
	}

	get permanentlyFellBack(): boolean {
		return this._manager.permanentlyFellBack;
	}

	get attempt(): number {
		return this._manager.attempt;
	}

	get reconnectState(): WsReconnectState {
		return this._manager.reconnectState;
	}

	scheduleReconnect(
		connectFn: ConnectFn,
		onPermanentFallback?: () => void
	): void {
		this._manager.scheduleReconnect(connectFn, onPermanentFallback);
	}

	/** @deprecated Use {@link scheduleReconnect} instead */
	schedule(connectFn: ConnectFn, onPermanentFallback?: () => void): void {
		this._manager.scheduleReconnect(connectFn, onPermanentFallback);
	}

	/**
	 * Lightweight cancel — clears the pending reconnect timer without altering shouldReconnect.
	 */
	cancel(): void {
		this._manager.cancel();
	}

	/**
	 * Full stop — marks the handler as destroyed and prevents any future reconnects.
	 */
	stop(): void {
		this._manager.stop();
	}

	reset(): void {
		this._manager.reset();
	}
}
