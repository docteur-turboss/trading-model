import type { WsReconnectState } from "@trading-model/common/utils/ws-reconnect";
import type { IWsReconnector } from "@trading-model/common/ws/i-ws-reconnector";
import { WsReconnectManager } from "./ws-reconnect-manager";

type ConnectFn = () => void;

export class WssReconnector implements IWsReconnector {
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

	setOnPermanentFallback(cb: () => void): void {
		this._manager.setOnPermanentFallback(cb);
	}

	scheduleReconnect(connectFn?: () => void): void {
		this._manager.scheduleReconnect(connectFn);
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
