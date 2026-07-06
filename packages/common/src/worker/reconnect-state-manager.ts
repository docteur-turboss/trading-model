import type { WsReconnectState } from "../utils/ws-reconnect";

export class ReconnectStateManager {
	readonly state: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _shouldReconnect = true;
	private _intentionalClose = false;

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	set shouldReconnect(value: boolean) {
		this._shouldReconnect = value;
	}

	get intentionalClose(): boolean {
		return this._intentionalClose;
	}

	get reconnectAttempt(): number {
		return this.state.attempt;
	}

	get attempt(): number {
		return this.state.attempt;
	}

	reset(): void {
		this._intentionalClose = false;
		this.state.attempt = 0;
	}

	cancel(): void {
		if (this.state.timer) {
			clearTimeout(this.state.timer);
			this.state.timer = null;
		}
	}

	stop(): void {
		this._shouldReconnect = false;
		this.state.destroyed = true;
		this.cancel();
	}

	markIntentionalClose(): void {
		this._intentionalClose = true;
	}
}
